import { createServer } from "node:http";
import { LLM_PORT, setLLMMode } from "../config.js";
import { askLLM, resetLLM } from "./llm-core.js";

// llm-server gère toujours le LLM en direct, jamais via proxy
setLLMMode("cli");

const PORT = LLM_PORT;

createServer(async (req, res) => {
	const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

	if (req.method === "POST" && url.pathname === "/ask") {
		let body = "";
		req.on("data", (c) => {
			body += c;
		});
		req.on("end", () => {
			const { username, text }: { username: string; text: string } =
				JSON.parse(body);

			res.writeHead(200, {
				"Content-Type": "application/x-ndjson",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
				"Access-Control-Allow-Origin": "*",
			});

			askLLM(
				{ username, text },
				{
					onFirstToken: () => {
						res.write(`${JSON.stringify({ type: "firstToken" })}\n`);
					},
					onChunk: (chunk: string) => {
						res.write(`${JSON.stringify({ type: "chunk", data: chunk })}\n`);
					},
				}
			)
				.then((full: string) => {
					res.write(`${JSON.stringify({ type: "done", data: full })}\n`);
					res.end();
				})
				.catch((err: unknown) => {
					res.write(
						`${JSON.stringify({ type: "error", data: (err as Error).message })}\n`
					);
					res.end();
				});
		});
		return;
	}

	if (req.method === "POST" && url.pathname === "/reset") {
		await resetLLM();
		res.writeHead(200, { "Access-Control-Allow-Origin": "*" });
		res.end("ok");
		return;
	}

	if (req.method === "GET" && url.pathname === "/health") {
		const { isLLMBusy } = await import("./llm-core.js");
		res.writeHead(200, {
			"Content-Type": "application/json",
			"Access-Control-Allow-Origin": "*",
		});
		res.end(
			JSON.stringify({
				ready: true,
				busy: isLLMBusy(),
				queued: 0,
			})
		);
		return;
	}

	res.writeHead(404);
	res.end("not found");
}).listen(PORT, () => {
	console.log(`LLM server listening on port ${PORT}`);
});
