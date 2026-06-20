import { describe, it, expect, beforeAll, mock } from "bun:test";

describe("reactionCommands", () => {
	it("maps emoji to commands", async () => {
		const { reactionCommands } = await import("../../src/bot/reactions.js");
		expect(reactionCommands["❌"]).toBe("stop");
		expect(reactionCommands["▶️"]).toBe("start");
		expect(reactionCommands["🗑️"]).toBe("clear");
	});

	it("returns undefined for unknown emoji", async () => {
		const { reactionCommands } = await import("../../src/bot/reactions.js");
		expect(reactionCommands["😀"]).toBeUndefined();
	});
});

describe("handleReactionCommand", () => {
	beforeAll(async () => {
		mock.module("../../src/core/llm-core.js", () => ({
			resetLLM: async () => {},
		}));
		mock.module("../../src/state/state.js", () => ({
			resetLLM: async () => {},
			clearCooldown: () => {},
			trackSpeaker: () => {},
			setPaused: () => {},
		}));
	});

	it("handles stop command", async () => {
		let paused: boolean | null = null;
		mock.module("../../src/state/state.js", () => ({
			clearCooldown: () => {},
			trackSpeaker: () => {},
			setPaused: (v: boolean) => { paused = v; },
		}));
		const { handleReactionCommand } = await import("../../src/bot/reactions.js");
		const msg = { channel: { id: "c1", name: "general" }, addReaction: async () => {} };
		await handleReactionCommand(msg as any, "❌", "u1");
		expect(paused).toBeTrue();
	});

	it("handles start command", async () => {
		let paused: boolean | null = null;
		mock.module("../../src/state/state.js", () => ({
			setPaused: (v: boolean) => { paused = v; },
		}));
		const { handleReactionCommand } = await import("../../src/bot/reactions.js");
		const msg = { channel: { id: "c1", name: "general" }, addReaction: async () => {} };
		await handleReactionCommand(msg as any, "▶️", "u1");
		expect(paused).toBeFalse();
	});

	it("handles clear command", async () => {
		let cleared = false;
		mock.module("../../src/core/llm-core.js", () => ({
			resetLLM: async () => {},
		}));
		mock.module("../../src/state/state.js", () => ({
			clearCooldown: () => { cleared = true; },
			trackSpeaker: () => {},
		}));
		const { handleReactionCommand } = await import("../../src/bot/reactions.js");
		const msg = { channel: { id: "c1", name: "general" }, addReaction: async () => {} };
		await handleReactionCommand(msg as any, "🗑️", "u1");
		expect(cleared).toBeTrue();
	});

	it("does nothing for unknown emoji", async () => {
		const { handleReactionCommand } = await import("../../src/bot/reactions.js");
		const msg = { channel: { id: "c1", name: "general" }, addReaction: async () => {} };
		await handleReactionCommand(msg as any, "😀", "u1");
	});

	it("adds ✅ reaction after command", async () => {
		let added = "";
		const { handleReactionCommand } = await import("../../src/bot/reactions.js");
		const msg = { channel: { id: "c1", name: "general" }, addReaction: async (e: string) => { added = e; } };
		mock.module("../../src/state/state.js", () => ({ setPaused: () => {} }));
		await handleReactionCommand(msg as any, "▶️", "u1");
		expect(added).toBe("✅");
	});
});
