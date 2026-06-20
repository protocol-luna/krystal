import { describe, it, expect, beforeAll, mock } from "bun:test";
import { mockConfig } from "./_mock-config.js";
import { execFile } from "node:child_process";

describe("bot", () => {
	beforeAll(() => {
		mockConfig();
		// Prevent Eris from making real connections
		mock.module("eris", () => {
			class MockTextChannel {
				type = 0;
				id = "c1";
				name = "general";
				guild = { id: "g1", emojis: [] };
			}
			return {
				default: class MockClient {
					user = { id: "bot1", username: "Luna" };
					guilds = new Map();
					constructor(_token: string, _opts: any) {}
					connect() {}
					editStatus() {}
					createMessage() {}
					sendChannelTyping() {}
					on() {}
				} as any,
				Client: class MockClient {
					user = { id: "bot1", username: "Luna" };
					guilds = new Map();
					constructor(_token: string, _opts: any) {}
					connect() {}
					editStatus() {}
					createMessage() {}
					sendChannelTyping() {}
					on() {}
				} as any,
				TextChannel: MockTextChannel as any,
			};
		});
		// Override spawn for llm-core CLI mode; keep other child_process exports
		mock.module("node:child_process", () => ({
			spawn: () => ({
				stdout: { on() {} },
				stderr: { on() {} },
				stdin: { write() {} },
				on() {},
				kill() {},
			}),
			execFile,
			exec: {},
			execSync: {},
		}));
	});

	it("imports successfully", async () => {
		const bot = await import("../src/bot.js");
		expect(bot.startBot).toBeFunction();
	});

	it("startBot exports a promise", async () => {
		const bot = await import("../src/bot.js");
		const result = bot.startBot();
		expect(result).toBeInstanceOf(Promise);
		await Promise.race([result, new Promise((r) => setTimeout(r, 500))]);
	});
});
