import { describe, it, expect, beforeAll } from "bun:test";
import { mockConfig } from "../../tests/_mock-config.js";

function mockFetchOK() {
	const orig = globalThis.fetch;
	const encoder = new TextEncoder();
	globalThis.fetch = async (url: string) => {
		if (url.includes("/reset")) return new Response(null, { status: 200 });
		if (url.includes("/ask")) {
			const body = [
				JSON.stringify({ type: "chunk", data: "Hello" }),
				JSON.stringify({ type: "done", data: "Hello" }),
			].join("\n") + "\n";
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(encoder.encode(body));
					controller.close();
				},
			});
			return new Response(stream, { status: 200 });
		}
		return new Response(null, { status: 404 });
	};
	return orig;
}

describe("askLLM", () => {
	beforeAll(() => mockConfig());

	it("queues and resolves", async () => {
		const orig = mockFetchOK();
		const mod = await import("../../src/core/llm-core.js");
		expect(mod.isLLMBusy()).toBeFalse();
		const text = await mod.askLLM({ username: "test", text: "hi" });
		expect(text).toBe("Hello");
		expect(mod.isLLMBusy()).toBeFalse();
		globalThis.fetch = orig;
	});

	it("isLLMBusy returns true while processing", async () => {
		const orig = mockFetchOK();
		const mod = await import("../../src/core/llm-core.js");
		const promise = mod.askLLM({ username: "test", text: "hi" });
		expect(mod.isLLMBusy()).toBeTrue();
		await promise;
		expect(mod.isLLMBusy()).toBeFalse();
		globalThis.fetch = orig;
	});

	it("calls onFirstToken and onChunk callbacks", async () => {
		const orig = mockFetchOK();
		const mod = await import("../../src/core/llm-core.js");
		let firstToken = false;
		const chunks: string[] = [];
		const text = await mod.askLLM({ username: "test", text: "hi" }, {
			onFirstToken: () => { firstToken = true; },
			onChunk: (c: string) => { chunks.push(c); },
		});
		expect(firstToken).toBeFalse(); // proxy mode uses llm-client which calls onChunk then onDone
		expect(chunks).toEqual(["Hello"]);
		expect(text).toBe("Hello");
		globalThis.fetch = orig;
	});
});

describe("resetLLM", () => {
	beforeAll(() => mockConfig());

	it("clears queue and resets state in proxy mode", async () => {
		const orig = globalThis.fetch;
		globalThis.fetch = async (url: string) => {
			if (url.includes("/reset")) return new Response(null, { status: 200 });
			return new Response(null, { status: 404 });
		};
		const mod = await import("../../src/core/llm-core.js");
		await mod.resetLLM();
		expect(mod.isLLMBusy()).toBeFalse();
		globalThis.fetch = orig;
	});
});

describe("shutdown", () => {
	beforeAll(() => mockConfig());

	it("is no-op in proxy mode", async () => {
		const mod = await import("../../src/core/llm-core.js");
		mod.shutdown();
	});
});
