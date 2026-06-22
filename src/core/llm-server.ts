import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { availableParallelism } from "node:os";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { LLAMA_MODEL_PATH, LLM_PORT, SYSTEM_PROMPT, LLM_SERVER_KEY, LLM_SESSION_TTL } from "../config.js";

const cpuThreads = availableParallelism();
const LLAMA_SERVER = resolve(cwd(), "bin/llama/llama-server");
const SLOTS = 4;
const LLAMA_SERVER_PORT = 3125;

interface Message {
	role: "system" | "user" | "assistant";
	content: string;
}

const sessions = new Map<string, { messages: Message[]; lastUsed: number }>();

let server: Server | undefined;
let llamaProcess: ChildProcess | null = null;

function checkAuth(req: IncomingMessage): boolean {
	if (!LLM_SERVER_KEY) return true;
	return req.headers.authorization === `Bearer ${LLM_SERVER_KEY}`;
}

function slotForSession(sessionId: string): number {
	let hash = 0;
	for (let i = 0; i < sessionId.length; i++) {
		hash = ((hash << 5) - hash + sessionId.charCodeAt(i)) | 0;
	}
	return Math.abs(hash) % SLOTS;
}

function cleanupStaleSessions(): void {
	const now = Date.now();
	for (const [sid, session] of sessions) {
		if (now - session.lastUsed > LLM_SESSION_TTL) {
			sessions.delete(sid);
		}
	}
}

function getSession(sessionId: string): { messages: Message[]; lastUsed: number } {
	let session = sessions.get(sessionId);
	if (!session) {
		session = { messages: [{ role: "system", content: SYSTEM_PROMPT }], lastUsed: Date.now() };
		sessions.set(sessionId, session);
	}
	session.lastUsed = Date.now();
	return session;
}

async function askLlamaServer(messages: Message[], slot: number): Promise<string> {
	const body = JSON.stringify({
		messages,
		id_slot: slot,
		cache_prompt: true,
		temperature: 0.8,
		top_k: 40,
		top_p: 0.95,
		min_p: 0.05,
		max_tokens: 2000,
	});

	const resp = await fetch(`http://127.0.0.1:${LLAMA_SERVER_PORT}/v1/chat/completions`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body,
	});

	if (!resp.ok) {
		const errText = await resp.text();
		throw new Error(`llama-server error ${resp.status}: ${errText.slice(0, 200)}`);
	}

	const data = (await resp.json()) as {
		choices: { message: { content: string } }[];
	};
	return data.choices?.[0]?.message?.content ?? "";
}

async function sendRequest(text: string, sessionId: string, username?: string): Promise<string> {
	const session = getSession(sessionId);
	const userMsg = username ? `${username}: ${text}` : text;
	session.messages.push({ role: "user", content: userMsg });

	const slot = slotForSession(sessionId);
	cleanupStaleSessions();

	const response = await askLlamaServer(session.messages, slot);

	session.messages.push({ role: "assistant", content: response });
	return response;
}

async function prewarmSlots(): Promise<void> {
	console.log("[llm-server] pre-warming slots...");
	const warm: Message[] = [
		{ role: "system", content: SYSTEM_PROMPT },
		{ role: "user", content: "ping" },
	];
	for (let i = 0; i < SLOTS; i++) {
		try {
			await askLlamaServer(warm, i);
		} catch {
			// slot might not be ready yet
		}
	}
	console.log("[llm-server] slots pre-warmed");
}

export async function startServer(): Promise<void> {
	llamaProcess = spawn(LLAMA_SERVER, [
		"-m", LLAMA_MODEL_PATH,
		"-t", String(cpuThreads),
		"-c", "4096",
		"-np", String(SLOTS),
		"--slot-prompt-similarity", "0",
		"--cache-reuse", "256",
		"--host", "127.0.0.1",
		"--port", String(LLAMA_SERVER_PORT),
		"--no-slots",
	], {
		stdio: ["ignore", "inherit", "inherit"],
	});

	llamaProcess.on("exit", (code) => {
		console.log(`[llama-server] exited (${code})`);
		llamaProcess = null;
	});

	console.log("[llm-server] waiting for llama-server...");
	let ready = false;
	for (let i = 0; i < 60; i++) {
		try {
			const resp = await fetch(`http://127.0.0.1:${LLAMA_SERVER_PORT}/health`);
			if (resp.ok) {
				ready = true;
				break;
			}
		} catch {
			// not ready yet
		}
		await new Promise((r) => setTimeout(r, 2000));
	}
	if (!ready) throw new Error("llama-server failed to start");
	console.log("[llm-server] llama-server ready");

	await prewarmSlots();

	server = createServer((req, res) => {
		if (!checkAuth(req)) {
			res.writeHead(401, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
			res.end(JSON.stringify({ error: "unauthorized" }));
			return;
		}

		const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

		if (req.method === "POST" && url.pathname === "/ask") {
			let body = "";
			req.on("data", (c) => { body += c; });
			req.on("end", async () => {
				const { username, text, sessionId } = JSON.parse(body) as {
					username: string;
					text: string;
					sessionId?: string;
				};

				if (!text) { res.writeHead(400); res.end("missing text"); return; }

				const sid = sessionId ?? "default";

				res.writeHead(200, {
					"Content-Type": "application/x-ndjson",
					"Cache-Control": "no-cache",
					"Access-Control-Allow-Origin": "*",
				});

				try {
					const t0 = performance.now();
					const response = await sendRequest(text, sid, username);
					const totalMs = (performance.now() - t0).toFixed(1);

					const brief = response.length > 60 ? `${response.slice(0, 60)}...` : response;
					console.log(`[llm-server] sid=${sid.slice(0, 8)} slot=${slotForSession(sid)} total=${totalMs}ms "${brief}"`);

					res.write(`${JSON.stringify({ type: "firstToken" })}\n`);
					if (response) res.write(`${JSON.stringify({ type: "chunk", data: response })}\n`);
					res.write(`${JSON.stringify({ type: "done", data: response })}\n`);
					res.end();
				} catch (err) {
					res.write(`${JSON.stringify({ type: "error", data: (err as Error).message })}\n`);
					res.end();
				}
			});
			return;
		}

		if (req.method === "GET" && url.pathname === "/health") {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ ready: true, sessions: sessions.size }));
			return;
		}

		if (req.method === "POST" && url.pathname === "/reset") {
			const sid = url.searchParams.get("sessionId");
			if (sid) {
				sessions.delete(sid);
			} else {
				sessions.clear();
			}
			res.writeHead(200);
			res.end("ok");
			return;
		}

		res.writeHead(404);
		res.end("not found");
	});

	server.listen(LLM_PORT, () => {
		console.log(`[llm-server] listening on port ${LLM_PORT}`);
	});
}
