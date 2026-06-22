import { describe, it, expect, beforeAll, mock } from "bun:test";
import { EventEmitter } from "node:events";
import { mockConfig } from "../../tests/_mock-config.js";

let capturedHandler: ((req: any, res: any) => void) | null = null;

/** Create a res-like object that returns a promise that resolves when end() is called */
function mockRes() {
	let status = 0;
	let body = "";
	const writes: string[] = [];
	let resolveEnd: () => void;
	const onEnd = new Promise<void>((r) => {
		resolveEnd = r;
	});
	return {
		promises: { onEnd },
		status: () => status,
		body: () => body,
		writes: () => writes,
		res: {
			writeHead: (s: number, _h?: any) => {
				status = s;
			},
			write: (d: string) => {
				writes.push(d);
			},
			end: (d?: string) => {
				if (d !== undefined) {
					body = d;
				}
				resolveEnd!();
			},
		},
	};
}

describe("llm-server", () => {
	beforeAll(() => {
		mockConfig();
		mock.module("node:http", () => ({
			createServer: (handler: any) => {
				capturedHandler = handler;
				return {
					listen: (_port: number, cb?: () => void) => {
						cb?.();
					},
				};
			},
		}));
		mock.module("node-llama-cpp", () => ({
			getLlama: async () => ({
				loadModel: async () => ({
					createContext: async () => ({
						getSequence: () => ({}),
					}),
				}),
			}),
			LlamaChatSession: class {
				prompt = async (
					_text: string,
					opts?: { onTextChunk?: (c: string) => void }
				) => {
					opts?.onTextChunk?.("mock reply");
				};
				dispose = () => {};
			},
		}));
	});

	it("startServer triggers listen", async () => {
		const { startServer } = await import("../../src/core/llm-server.js");
		await startServer();
		expect(capturedHandler).toBeDefined();
	});

	it("returns 404 for unknown routes", async () => {
		const { startServer: _s } = await import("../../src/core/llm-server.js");
		const m = mockRes();
		const req = new EventEmitter() as any;
		req.url = "/unknown";
		req.method = "GET";
		req.headers = { host: "localhost:3124" };
		capturedHandler!(req, m.res);
		await m.promises.onEnd;
		expect(m.status()).toBe(404);
		expect(m.body()).toBe("not found");
	});

	it("handles GET /health", async () => {
		await import("../../src/core/llm-server.js");
		const m = mockRes();
		const req = new EventEmitter() as any;
		req.url = "/health";
		req.method = "GET";
		req.headers = { host: "localhost:3124" };
		capturedHandler!(req, m.res);
		await m.promises.onEnd;
		expect(m.status()).toBe(200);
		const data = JSON.parse(m.body());
		expect(data.ready).toBeTrue();
		expect(typeof data.busy).toBe("boolean");
	});

	it("handles POST /reset", async () => {
		const origFetch = globalThis.fetch;
		globalThis.fetch = (async (url: string) => {
			if (url.includes("/reset")) {
				return new Response(null, { status: 200 });
			}
			return new Response(null, { status: 404 });
		}) as any;
		await import("../../src/core/llm-server.js");
		const m = mockRes();
		const req = new EventEmitter() as any;
		req.url = "/reset";
		req.method = "POST";
		req.headers = { host: "localhost:3124" };
		capturedHandler!(req, m.res);
		await m.promises.onEnd;
		expect(m.status()).toBe(200);
		globalThis.fetch = origFetch;
	});

	it("handles POST /ask with streaming response", async () => {
		const origFetch = globalThis.fetch;
		const encoder = new TextEncoder();
		globalThis.fetch = (async (url: string) => {
			if (url.includes("/ask")) {
				const body = `${[
					JSON.stringify({ type: "chunk", data: "Hi" }),
					JSON.stringify({ type: "done", data: "Hi" }),
				].join("\n")}\n`;
				const stream = new ReadableStream({
					start(ctrl) {
						ctrl.enqueue(encoder.encode(body));
						ctrl.close();
					},
				});
				return new Response(stream, { status: 200 });
			}
			return new Response(null, { status: 200 });
		}) as any;
		await import("../../src/core/llm-server.js");
		const m = mockRes();
		const req = new EventEmitter() as any;
		req.url = "/ask";
		req.method = "POST";
		req.headers = { host: "localhost:3124" };
		capturedHandler!(req, m.res);
		req.emit(
			"data",
			Buffer.from(JSON.stringify({ username: "test", text: "hi" }))
		);
		req.emit("end");
		await m.promises.onEnd;
		expect(m.status()).toBe(200);
		expect(m.writes().length).toBeGreaterThanOrEqual(1);
		const lastWrite = m.writes()[m.writes().length - 1];
		expect(lastWrite).toContain("done");
		globalThis.fetch = origFetch;
	});
});
