import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import { mockConfig } from "../_mock-config.js";

describe("askLLM", () => {
	beforeAll(() => mockConfig());

	it("throws on non-ok response", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => new Response(null, { status: 500 });
		const { askLLM } = await import("../../src/core/llm-client.js");
		await expect(askLLM({ username: "test", text: "hi" }, { onChunk: () => {} })).rejects.toThrow("LLM server error");
		globalThis.fetch = originalFetch;
	});

	it("parses NDJSON stream with chunk/done events", async () => {
		const originalFetch = globalThis.fetch;
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(JSON.stringify({ type: "firstToken" }) + "\n"));
				controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk", data: "Hello" }) + "\n"));
				controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk", data: " world" }) + "\n"));
				controller.enqueue(encoder.encode(JSON.stringify({ type: "done", data: "Hello world" }) + "\n"));
				controller.close();
			},
		});
		globalThis.fetch = async () => new Response(stream, { status: 200 });
		const { askLLM } = await import("../../src/core/llm-client.js");
		let firstToken = false;
		const chunks: string[] = [];
		const result = await askLLM({ username: "test", text: "hi" }, {
			onFirstToken: () => { firstToken = true; },
			onChunk: (c) => { chunks.push(c); },
		});
		expect(firstToken).toBeTrue();
		expect(chunks).toEqual(["Hello", " world"]);
		expect(result).toBe("Hello world");
		globalThis.fetch = originalFetch;
	});

	it("handles error event from server", async () => {
		const originalFetch = globalThis.fetch;
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(JSON.stringify({ type: "error", data: "model overloaded" }) + "\n"));
				controller.close();
			},
		});
		globalThis.fetch = async () => new Response(stream, { status: 200 });
		const { askLLM } = await import("../../src/core/llm-client.js");
		await expect(askLLM({ username: "test", text: "hi" }, { onChunk: () => {} })).rejects.toThrow("model overloaded");
		globalThis.fetch = originalFetch;
	});

	it("skips malformed JSON lines", async () => {
		const originalFetch = globalThis.fetch;
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode("not json\n"));
				controller.enqueue(encoder.encode(JSON.stringify({ type: "done", data: "" }) + "\n"));
				controller.close();
			},
		});
		globalThis.fetch = async () => new Response(stream, { status: 200 });
		const { askLLM } = await import("../../src/core/llm-client.js");
		const result = await askLLM({ username: "test", text: "hi" }, { onChunk: () => {} });
		expect(result).toBe("");
		globalThis.fetch = originalFetch;
	});
});

describe("resetLLM", () => {
	beforeAll(() => mockConfig());

	it("sends POST to /reset", async () => {
		const originalFetch = globalThis.fetch;
		let called = "";
		globalThis.fetch = async (url: string, opts: any) => {
			called = `${opts.method} ${url}`;
			return new Response("ok", { status: 200 });
		};
		const { resetLLM } = await import("../../src/core/llm-client.js");
		await resetLLM();
		expect(called).toContain("POST");
		expect(called).toContain("/reset");
		globalThis.fetch = originalFetch;
	});

	it("handles reset failure gracefully", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => new Response(null, { status: 500 });
		const { resetLLM } = await import("../../src/core/llm-client.js");
		await resetLLM(); // should not throw
		globalThis.fetch = originalFetch;
	});
});

describe("isLLMBusy", () => {
	beforeAll(() => mockConfig());

	it("returns true on fetch failure", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => { throw new Error("network error"); };
		const { isLLMBusy } = await import("../../src/core/llm-client.js");
		const busy = await isLLMBusy();
		expect(busy).toBeTrue();
		globalThis.fetch = originalFetch;
	});

	it("returns true on non-ok response", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => new Response(null, { status: 503 });
		const { isLLMBusy } = await import("../../src/core/llm-client.js");
		const busy = await isLLMBusy();
		expect(busy).toBeTrue();
		globalThis.fetch = originalFetch;
	});

	it("returns the busy field from response", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => new Response(JSON.stringify({ busy: false }), { status: 200 });
		const { isLLMBusy } = await import("../../src/core/llm-client.js");
		const busy = await isLLMBusy();
		expect(busy).toBeFalse();
		globalThis.fetch = originalFetch;
	});
});
