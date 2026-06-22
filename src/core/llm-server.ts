import { availableParallelism } from "node:os";
import { createInterface } from "node:readline";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { cwd } from "node:process";
import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import {
	LLAMA_MODEL_PATH,
	LLM_PORT,
	SYSTEM_PROMPT,
	LLM_SERVER_KEY,
	LLM_SESSION_TTL,
} from "../config.js";

const LLAMA_CLI = resolve(cwd(), "bin/llama/llama-cli");

function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
	if (!LLM_SERVER_KEY) {
		return true;
	}
	const header = req.headers.authorization;
	if (header === `Bearer ${LLM_SERVER_KEY}`) {
		return true;
	}
	res.writeHead(401, {
		"Content-Type": "application/json",
		"Access-Control-Allow-Origin": "*",
	});
	res.end(JSON.stringify({ error: "unauthorized" }));
	return false;
}

const SESSION_TTL = LLM_SESSION_TTL * 60 * 1000;
const PRUNE_INTERVAL = 60_000;

interface SessionEntry {
	process: ChildProcess;
	lastUsed: number;
	send: (msg: string) => Promise<string>;
	close: () => void;
}

let server: Server | undefined;
let sessions: Map<string, SessionEntry>;
const cpuThreads = availableParallelism();

function spawnSession(): SessionEntry {
	const proc = spawn(
		LLAMA_CLI,
		[
			"-m",
			LLAMA_MODEL_PATH,
			"-t",
			String(cpuThreads),
			"-c",
			"4096",
			"--conversation",
			"--simple-io",
			"-sys",
			SYSTEM_PROMPT,
			"--temp",
			"0.8",
			"--top-k",
			"40",
			"--top-p",
			"0.95",
			"--min-p",
			"0.05",
		],
		{
			stdio: ["pipe", "pipe", "pipe"],
		}
	);

	const rl = createInterface({
		input: proc.stdout!,
		crlfDelay: Number.POSITIVE_INFINITY,
	});
	const errBuf: string[] = [];
	proc.stderr!.on("data", (d) => errBuf.push(d.toString()));

	let readyResolve: (() => void) | null = null;
	let readResolve: ((resp: string) => void) | null = null;
	let responseLines: string[] = [];
	let collecting = false;
	let ready = false;

	const out: string[] = [];
	rl.on("line", (line) => {
		out.push(line);
		if (!ready) {
			if (line.trim() === ">") {
				ready = true;
				if (readyResolve) {
					readyResolve();
					readyResolve = null;
				}
			}
			return;
		}

		if (readResolve) {
			if (line.startsWith("[ Prompt:")) {
				const resp = responseLines.join("\n").trim();
				responseLines = [];
				collecting = false;
				const r = readResolve;
				readResolve = null;
				r(resp);
				return;
			}

			if (!collecting && line.trim() === "") {
				collecting = true;
				return;
			}

			if (collecting) {
				responseLines.push(line);
			}
		}
	});

	proc.on("exit", (code) => {
		const dump = out.join("|").slice(0, 400);
		const err = errBuf.join("").trim();
		console.log(
			`[llm-server] llama-cli exited (${code}). stdout (${out.length}): ${dump}`
		);
		if (readResolve) {
			readResolve("");
		}
		if (err) {
			console.error(`[llm-server] llama-cli stderr: ${err.slice(0, 500)}`);
		}
	});

	return {
		process: proc,
		lastUsed: Date.now(),
		send: async (msg: string): Promise<string> => {
			if (!ready) {
				await new Promise<void>((resolve) => {
					readyResolve = resolve;
				});
			}
			responseLines = [];
			collecting = false;
			return new Promise((resolve, reject) => {
				const timeout = setTimeout(() => {
					reject(new Error("response timeout"));
				}, 120_000);
				readResolve = (resp: string) => {
					clearTimeout(timeout);
					resolve(resp);
				};
				proc.stdin!.write(`${msg}\n`);
			});
		},
		close: () => {
			try {
				proc.stdin!.write("/exit\n");
			} catch {
				// ignore
			}
			setTimeout(() => {
				proc.kill();
			}, 2000);
		},
	};
}

export async function startServer(): Promise<void> {
	sessions = new Map();
	await Promise.resolve();

	setInterval(() => {
		const now = Date.now();
		for (const [id, s] of sessions) {
			if (now - s.lastUsed > SESSION_TTL) {
				s.close();
				sessions.delete(id);
				console.log(`[llm-server] pruned stale session: ${id.slice(0, 8)}...`);
			}
		}
	}, PRUNE_INTERVAL);

	server = createServer((req, res) => {
		if (!checkAuth(req, res)) {
			return;
		}

		const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

		if (req.method === "POST" && url.pathname === "/ask") {
			let body = "";
			req.on("data", (c) => {
				body += c;
			});
			req.on("end", async () => {
				const { username, text, sessionId } = JSON.parse(body) as {
					username: string;
					text: string;
					sessionId?: string;
				};

				if (!text) {
					res.writeHead(400);
					res.end("missing text");
					return;
				}

				const sid = sessionId ?? "default";
				let entry = sessions.get(sid);

				if (!entry) {
					console.log(
						`[llm-server] spawning llama-cli for session: ${sid.slice(0, 8)}...`
					);
					entry = spawnSession();
					sessions.set(sid, entry);
				}

				entry.lastUsed = Date.now();

				res.writeHead(200, {
					"Content-Type": "application/x-ndjson",
					"Cache-Control": "no-cache",
					Connection: "keep-alive",
					"Access-Control-Allow-Origin": "*",
				});

				try {
					const t0 = performance.now();
					const userMsg = username ? `${username}: ${text}` : text;
					const response = await entry.send(userMsg);
					const t1 = performance.now();
					const totalMs = (t1 - t0).toFixed(1);

					const brief =
						response.length > 60 ? `${response.slice(0, 60)}...` : response;
					console.log(
						`[llm-server] sid=${sid.slice(0, 8)} total=${totalMs}ms "${brief}"`
					);

					res.write(`${JSON.stringify({ type: "firstToken" })}\n`);
					if (response) {
						res.write(`${JSON.stringify({ type: "chunk", data: response })}\n`);
					}
					res.write(`${JSON.stringify({ type: "done", data: response })}\n`);
					res.end();
				} catch (err) {
					res.write(
						`${JSON.stringify({ type: "error", data: (err as Error).message })}\n`
					);
					res.end();
				}
			});
			return;
		}

		if (req.method === "POST" && url.pathname === "/reset") {
			const sessionId = url.searchParams.get("sessionId");
			if (sessionId) {
				const entry = sessions.get(sessionId);
				if (entry) {
					entry.close();
					sessions.delete(sessionId);
					console.log(
						`[llm-server] reset session: ${sessionId.slice(0, 8)}...`
					);
				}
			} else {
				for (const [, s] of sessions) {
					s.close();
				}
				sessions.clear();
				console.log("[llm-server] reset all sessions");
			}
			res.writeHead(200, { "Access-Control-Allow-Origin": "*" });
			res.end("ok");
			return;
		}

		if (req.method === "GET" && url.pathname === "/health") {
			res.writeHead(200, {
				"Content-Type": "application/json",
				"Access-Control-Allow-Origin": "*",
			});
			res.end(
				JSON.stringify({
					ready: true,
					busy: false,
					sessions: sessions?.size ?? 0,
				})
			);
			return;
		}

		res.writeHead(404);
		res.end("not found");
	});

	server.listen(LLM_PORT, () => {
		console.log(`[llm-server] listening on port ${LLM_PORT}`);
	});
}
