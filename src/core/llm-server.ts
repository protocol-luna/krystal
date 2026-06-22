import { createServer, type Server } from "node:http";
import { LLAMA_MODEL_PATH, LLM_PORT, SYSTEM_PROMPT, LLM_SERVER_KEY } from "../config.js";
import type { LlamaChatSession } from "node-llama-cpp";

function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
	if (!LLM_SERVER_KEY) {
		return true;
	}
	const header = req.headers.authorization;
	if (header === `Bearer ${LLM_SERVER_KEY}`) {
		return true;
	}
	res.writeHead(401, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
	res.end(JSON.stringify({ error: "unauthorized" }));
	return false;
}

const SESSION_TTL = 10 * 60 * 1000;
const PRUNE_INTERVAL = 60_000;

let server: Server | undefined;
let sessions: Map<string, { session: LlamaChatSession; lastUsed: number }>;

export async function startServer(): Promise<void> {
	const { getLlama, LlamaChatSession } = await import("node-llama-cpp");
	console.log(`[llm-server] loading model: ${LLAMA_MODEL_PATH}`);
	const llama = await getLlama();
	const model = await llama.loadModel({ modelPath: LLAMA_MODEL_PATH, useMlock: true });
	console.log("[llm-server] model loaded");

	sessions = new Map();

	setInterval(() => {
		const now = Date.now();
		for (const [id, s] of sessions) {
			if (now - s.lastUsed > SESSION_TTL) {
				s.session.dispose();
				sessions.delete(id);
				console.log(`[llm-server] pruned stale session: ${id.slice(0, 8)}...`);
			}
		}
	}, PRUNE_INTERVAL);

	// biome-ignore lint/suspicious/useAwait: async needed for await inside /ask and /reset handlers
	server = createServer(async (req, res) => {
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
					try {
						const ctx = await model.createContext({ contextSize: 4096, batchSize: 4096 });
						const seq = ctx.getSequence();
						const session = new LlamaChatSession({ contextSequence: seq, systemPrompt: SYSTEM_PROMPT });
						entry = { session, lastUsed: Date.now() };
						sessions.set(sid, entry);
						console.log(
							`[llm-server] new session: ${sid.slice(0, 8)}... (${sessions.size} total)`
						);
					} catch (err) {
						res.writeHead(500);
						res.end(
							JSON.stringify({ type: "error", data: (err as Error).message })
						);
						return;
					}
				}

				entry.lastUsed = Date.now();

				res.writeHead(200, {
					"Content-Type": "application/x-ndjson",
					"Cache-Control": "no-cache",
					Connection: "keep-alive",
					"Access-Control-Allow-Origin": "*",
				});

				try {
					const promptText = username ? `${username}: ${text}` : text;
					let firstToken = true;
					let fullText = "";
					let chunkBuf = "";

					await entry.session.prompt(promptText, {
						temperature: 0.8,
						minP: 0.05,
						topK: 40,
						topP: 0.95,
						maxTokens: 4096,
						onTextChunk(token: string) {
							if (!token) {
								return;
							}
							if (firstToken) {
								firstToken = false;
								res.write(`${JSON.stringify({ type: "firstToken" })}\n`);
							}
							fullText += token;
							chunkBuf += token;
							if (chunkBuf.includes("\n") || chunkBuf.length >= 40) {
								res.write(
									`${JSON.stringify({ type: "chunk", data: chunkBuf })}\n`
								);
								chunkBuf = "";
							}
						},
					});

					if (chunkBuf) {
						res.write(`${JSON.stringify({ type: "chunk", data: chunkBuf })}\n`);
					}
					res.write(`${JSON.stringify({ type: "done", data: fullText })}\n`);
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
					entry.session.dispose();
					sessions.delete(sessionId);
					console.log(
						`[llm-server] reset session: ${sessionId.slice(0, 8)}...`
					);
				}
			} else {
				for (const [, s] of sessions) {
					s.session.dispose();
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
