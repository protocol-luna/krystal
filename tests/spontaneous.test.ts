import { describe, it, expect, beforeAll } from "bun:test";
import { mockConfig } from "./_mock-config.js";

describe("trySpawn", () => {
	beforeAll(() => mockConfig());

	function mockFetch(busy: boolean, responseBody = "") {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async (url: string) => {
			if (url.includes("/health")) {
				return new Response(JSON.stringify({ busy }), { status: 200 });
			}
			if (url.includes("/reset")) {
				return new Response(null, { status: 200 });
			}
			if (url.includes("/ask")) {
				const lines = [
					JSON.stringify({ type: "firstToken" }) + "\n",
					JSON.stringify({ type: "chunk", data: responseBody }) + "\n",
					JSON.stringify({ type: "done", data: responseBody }) + "\n",
				];
				const body = lines.join("");
				const stream = new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode(body));
						controller.close();
					},
				});
				return new Response(stream, { status: 200 });
			}
			return new Response(null, { status: 404 });
		};
		return originalFetch;
	}

	it("returns early when LLM is busy", async () => {
		const orig = mockFetch(true);
		const { trySpawn } = await import("../src/spontaneous.js");
		const client = { guilds: new Map() };
		await trySpawn(client as any);
		globalThis.fetch = orig;
	});

	it("returns early when no guilds", async () => {
		const orig = mockFetch(false);
		const { trySpawn } = await import("../src/spontaneous.js");
		const client = { guilds: new Map() };
		await trySpawn(client as any);
		globalThis.fetch = orig;
	});

	it("picks guild and sends message when LLM responds", async () => {
		const orig = mockFetch(false, "Hello everyone!");
		const textChannel: any = {
			type: 0,
			id: "c1",
			name: "general",
			lastMessageID: "100",
			guild: { id: "g1" },
			getMessages: async () => [],
		};
		const guild: any = {
			id: "g1",
			name: "Test Guild",
			channels: new Map([["c1", textChannel]]),
		};
		let sentMessage = "";
		const { trySpawn } = await import("../src/spontaneous.js");
		const client: any = {
			guilds: new Map([["g1", guild]]),
			createMessage: async (_id: string, opts: any) => { sentMessage = opts.content; },
		};
		await trySpawn(client);
		expect(sentMessage).toBe("Hello everyone!");
		globalThis.fetch = orig;
	});
});
