import { describe, it, expect, beforeAll } from "bun:test";
import { mockConfig } from "../_mock-config.js";

function mockCompletion(response: string, status = 200) {
	return (async () =>
		new Response(
			JSON.stringify({
				choices: [{ message: { content: response } }],
				usage: { prompt_tokens: 10, completion_tokens: 5 },
			}),
			{ status }
		)) as any;
}

describe("askLLM", () => {
	beforeAll(() => mockConfig());

	it("throws on non-ok response", async () => {
		const orig = globalThis.fetch;
		globalThis.fetch = mockCompletion("", 500);
		const { askLLM } = await import("../../src/core/llm-client.js");
		await expect(
			askLLM({ username: "test", text: "hi" }, { onChunk: () => {} })
		).rejects.toThrow("llama-server error");
		globalThis.fetch = orig;
	});

	it("returns response and calls callbacks", async () => {
		const orig = globalThis.fetch;
		globalThis.fetch = mockCompletion("Hello world");
		const { askLLM } = await import("../../src/core/llm-client.js");
		let firstToken = false;
		const chunks: string[] = [];
		const result = await askLLM(
			{ username: "test", text: "hi" },
			{
				onFirstToken: () => {
					firstToken = true;
				},
				onChunk: (c) => {
					chunks.push(c);
				},
			}
		);
		expect(firstToken).toBeTrue();
		expect(chunks).toEqual(["Hello world"]);
		expect(result).toBe("Hello world");
		globalThis.fetch = orig;
	});

	it("sends session messages to /v1/chat/completions", async () => {
		const orig = globalThis.fetch;
		let sentBody = "";
		globalThis.fetch = (async (url: string, opts: any) => {
			sentBody = opts.body;
			return new Response(
				JSON.stringify({
					choices: [{ message: { content: "ok" } }],
				}),
				{ status: 200 }
			);
		}) as any;
		const { askLLM, resetLLM } = await import("../../src/core/llm-client.js");
		await askLLM({ username: "tester", text: "hello", sessionId: "s1" }, { onChunk: () => {} });
		const body = JSON.parse(sentBody);
		expect(body.messages[0].role).toBe("system");
		expect(body.messages[1].role).toBe("user");
		expect(body.messages[1].content).toContain("tester: hello");
		expect(body.id_slot).toBeDefined();
		expect(body.cache_prompt).toBeTrue();
		await resetLLM();
		globalThis.fetch = orig;
	});
});

describe("resetLLM", () => {
	beforeAll(() => mockConfig());

	it("clears in-memory sessions without HTTP", async () => {
		const orig = globalThis.fetch;
		let fetchCalled = false;
		globalThis.fetch = (async () => {
			fetchCalled = true;
			return new Response(null, { status: 200 });
		}) as any;
		const { resetLLM, askLLM } = await import("../../src/core/llm-client.js");
		// populate a session
		globalThis.fetch = mockCompletion("ok");
		await askLLM({ username: "t", text: "hi" }, { onChunk: () => {} });
		// now reset (no fetch should be made)
		globalThis.fetch = (async () => {
			fetchCalled = true;
			return new Response(null, { status: 200 });
		}) as any;
		await resetLLM();
		expect(fetchCalled).toBeFalse();
		globalThis.fetch = orig;
	});
});

describe("isLLMBusy", () => {
	beforeAll(() => mockConfig());

	it("returns true on fetch failure", async () => {
		const orig = globalThis.fetch;
		globalThis.fetch = (async () => {
			throw new Error("network error");
		}) as any;
		const { isLLMBusy } = await import("../../src/core/llm-client.js");
		const busy = await isLLMBusy();
		expect(busy).toBeTrue();
		globalThis.fetch = orig;
	});

	it("returns true on non-ok response", async () => {
		const orig = globalThis.fetch;
		globalThis.fetch = (async () => new Response(null, { status: 503 })) as any;
		const { isLLMBusy } = await import("../../src/core/llm-client.js");
		const busy = await isLLMBusy();
		expect(busy).toBeTrue();
		globalThis.fetch = orig;
	});

	it("returns false on healthy response", async () => {
		const orig = globalThis.fetch;
		globalThis.fetch = (async () => new Response("ok", { status: 200 })) as any;
		const { isLLMBusy } = await import("../../src/core/llm-client.js");
		const busy = await isLLMBusy();
		expect(busy).toBeFalse();
		globalThis.fetch = orig;
	});
});
