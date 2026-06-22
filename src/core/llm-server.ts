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

interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

interface SessionEntry {
	seq: import("node-llama-cpp").LlamaContextSequence;
	model: import("node-llama-cpp").LlamaModel;
	messages: ChatMessage[];
	nextTokenIndex: number;
	lastUsed: number;
}

function formatChatML(messages: ChatMessage[]): string {
	let text = "";
	for (const msg of messages) {
		text += `<|im_start|>${msg.role}\n${msg.content}<|im_end|>\n`;
	}
	return text;
}

let server: Server | undefined;
let sessions: Map<string, SessionEntry>;

export async function startServer(): Promise<void> {
	const { getLlama } = await import("node-llama-cpp");
	console.log(`[llm-server] loading model: ${LLAMA_MODEL_PATH}`);
	const llama = await getLlama();
	const model = await llama.loadModel({
		modelPath: LLAMA_MODEL_PATH,
		useMlock: true,
	});
	console.log("[llm-server] model loaded");

	sessions = new Map();

	setInterval(() => {
		const now = Date.now();
		for (const [id, s] of sessions) {
			if (now - s.lastUsed > SESSION_TTL) {
				s.seq.dispose();
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
						const ctx = await model.createContext({
							contextSize: 4096,
							batchSize: 4096,
						});
						const seq = ctx.getSequence();
						const messages: ChatMessage[] = [
							{ role: "system", content: SYSTEM_PROMPT },
						];
						entry = {
							seq,
							model,
							messages,
							nextTokenIndex: 0,
							lastUsed: Date.now(),
						};
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
					const t0 = performance.now();

					const userMsg = username ? `${username}: ${text}` : text;
					entry.messages.push({ role: "user", content: userMsg });
					entry.messages.push({ role: "assistant", content: "" });

					const convText = formatChatML(entry.messages);
					const convTokens = entry.model.tokenize(convText);
					const newTokens = convTokens.slice(entry.nextTokenIndex);

					const t1 = performance.now();
					const prepareMs = (t1 - t0).toFixed(1);

					let genTokens: import("node-llama-cpp").Token[] = [];
					let prevDetokLen = 0;
					let firstTokenSent = false;
					let chunkBuf = "";
					let firstTokenMs: string | undefined;

					for await (const token of entry.seq.evaluate(newTokens, {
						temperature: 0.8,
						minP: 0.05,
						topK: 40,
						topP: 0.95,
						yieldEogToken: true,
					})) {
						if (entry.model.isEogToken(token)) {
							break;
						}

						if (!firstTokenSent) {
							firstTokenMs = (performance.now() - t1).toFixed(1);
							firstTokenSent = true;
							res.write(`${JSON.stringify({ type: "firstToken" })}\n`);
						}

						genTokens.push(token);

						if (genTokens.length > 3) {
							const textSoFar = entry.model.detokenize(genTokens);
							const stopIdx = textSoFar.indexOf("<|im_end|>");
							if (stopIdx !== -1) {
								const keepText = textSoFar.slice(0, stopIdx);
								genTokens = entry.model.tokenize(keepText);
								break;
							}

							const delta = textSoFar.slice(prevDetokLen);
							if (delta) {
								chunkBuf += delta;
								if (chunkBuf.includes("\n") || chunkBuf.length >= 40) {
									res.write(
										`${JSON.stringify({ type: "chunk", data: chunkBuf })}\n`
									);
									chunkBuf = "";
								}
							}
							prevDetokLen = textSoFar.length;
						}

						if (genTokens.length > 4000) {
							break;
						}
					}

					const responseText = entry.model.detokenize(genTokens);
					let cleanResp = responseText;
					if (cleanResp.includes("<|im_end|>")) {
						cleanResp = cleanResp.slice(0, cleanResp.indexOf("<|im_end|>"));
					}
					const t2 = performance.now();
					const totalMs = (t2 - t0).toFixed(1);
					const brief =
						cleanResp.length > 60 ? `${cleanResp.slice(0, 60)}...` : cleanResp;
					console.log(
						`[llm-server] sid=${sid.slice(0, 8)} prepare=${prepareMs}ms firstToken=${firstTokenMs ?? "?"}ms total=${totalMs}ms tokens=${entry.seq.nextTokenIndex} "${brief}"`
					);

					if (!firstTokenSent && cleanResp) {
						res.write(`${JSON.stringify({ type: "firstToken" })}\n`);
					}
					if (chunkBuf) {
						res.write(`${JSON.stringify({ type: "chunk", data: chunkBuf })}\n`);
					}

					entry.nextTokenIndex = entry.seq.nextTokenIndex;

					const lastMsg = entry.messages[entry.messages.length - 1];
					if (lastMsg.role === "assistant") {
						lastMsg.content = cleanResp;
					}

					res.write(`${JSON.stringify({ type: "done", data: cleanResp })}\n`);
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
					entry.seq.dispose();
					sessions.delete(sessionId);
					console.log(
						`[llm-server] reset session: ${sessionId.slice(0, 8)}...`
					);
				}
			} else {
				for (const [, s] of sessions) {
					s.seq.dispose();
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
