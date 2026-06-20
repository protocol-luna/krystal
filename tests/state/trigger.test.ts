import { describe, it, expect, beforeAll, mock } from "bun:test";
import { mockConfig } from "../_mock-config.js";

function makeMsg(overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		channel: { id: "c1", type: 0 },
		content: "",
		author: { bot: false, id: "u1", username: "User" },
		mentions: [],
		member: null,
		...overrides,
	};
}

describe("evaluateMessage", () => {
	beforeAll(() => {
		mockConfig();
	});

	it("ignores bot messages", async () => {
		const { evaluateMessage } = await import("../../src/state/trigger.js");
		const msg = makeMsg({ author: { bot: true, id: "b1", username: "Bot" } });
		const r = evaluateMessage(msg as any, "b2", "Luna");
		expect(r.shouldRespond).toBeFalse();
		expect(r.reason).toBeNull();
	});

	it("handles -stop command", async () => {
		const { evaluateMessage } = await import("../../src/state/trigger.js");
		const msg = makeMsg({ content: "-stop" });
		const r = evaluateMessage(msg as any, "b1", "Luna");
		expect(r.shouldRespond).toBeTrue();
		expect(r.reason).toBe("stop");
	});

	it("handles -start command", async () => {
		const { evaluateMessage } = await import("../../src/state/trigger.js");
		const msg = makeMsg({ content: "-start" });
		const r = evaluateMessage(msg as any, "b1", "Luna");
		expect(r.shouldRespond).toBeTrue();
		expect(r.reason).toBe("start");
	});

	it("handles -clear command", async () => {
		const { evaluateMessage } = await import("../../src/state/trigger.js");
		const msg = makeMsg({ content: "-clear" });
		const r = evaluateMessage(msg as any, "b1", "Luna");
		expect(r.shouldRespond).toBeTrue();
		expect(r.reason).toBe("clear");
	});

	it("ignores own messages", async () => {
		const { evaluateMessage } = await import("../../src/state/trigger.js");
		const msg = makeMsg({ author: { bot: false, id: "b1", username: "Luna" } });
		const r = evaluateMessage(msg as any, "b1", "Luna");
		expect(r.shouldRespond).toBeFalse();
	});

	it("responds to mention", async () => {
		const { evaluateMessage } = await import("../../src/state/trigger.js");
		const msg = makeMsg({ mentions: [{ id: "b1" }] });
		const r = evaluateMessage(msg as any, "b1", "Luna");
		expect(r.shouldRespond).toBeTrue();
		expect(r.reason).toBe("mention");
	});

	it("responds in DM when replyInDM is true", async () => {
		const { evaluateMessage } = await import("../../src/state/trigger.js");
		const msg = makeMsg({ channel: { id: "dm1", type: 1 } });
		const r = evaluateMessage(msg as any, "b1", "Luna");
		expect(r.shouldRespond).toBeTrue();
		expect(r.reason).toBe("dm");
	});

	it("ignores DM when replyInDM is false", async () => {
		mockConfig({ replyInDM: false });
		const { evaluateMessage } = await import("../../src/state/trigger.js");
		const msg = makeMsg({ channel: { id: "dm1", type: 1 } });
		const r = evaluateMessage(msg as any, "b1", "Luna");
		expect(r.shouldRespond).toBeFalse();
	});

	it("ignores messages when paused", async () => {
		mock.module("../../src/state/state.js", () => ({
			isPaused: () => true,
			isOnCooldown: () => false,
			setPaused: () => {},
			markReplied: () => {},
		}));
		const { evaluateMessage } = await import("../../src/state/trigger.js");
		const msg = makeMsg({ content: "hello" });
		const r = evaluateMessage(msg as any, "b1", "Luna");
		expect(r.shouldRespond).toBeFalse();
	});

	it("ignores messages on cooldown", async () => {
		mock.module("../../src/state/state.js", () => ({
			isPaused: () => false,
			isOnCooldown: () => true,
			setPaused: () => {},
			markReplied: () => {},
		}));
		const { evaluateMessage } = await import("../../src/state/trigger.js");
		const msg = makeMsg({ content: "hello" });
		const r = evaluateMessage(msg as any, "b1", "Luna");
		expect(r.shouldRespond).toBeFalse();
	});

	it("responds to bot nick name", async () => {
		mock.module("../../src/state/state.js", () => ({
			isPaused: () => false,
			isOnCooldown: () => false,
			setPaused: () => {},
			markReplied: () => {},
		}));
		const { evaluateMessage } = await import("../../src/state/trigger.js");
		const msg = makeMsg({
			content: "hey Luna",
			channel: {
				id: "c1",
				type: 0,
				guild: { members: new Map([["b1", { nick: "Luna" }]]) },
			},
		});
		const r = evaluateMessage(msg as any, "b1", "Luna", false);
		expect(r.shouldRespond).toBeTrue();
		expect(r.reason).toBe("name");
		expect(r.botName).toBe("Luna");
	});

	it("responds to config name", async () => {
		mock.module("../../src/state/state.js", () => ({
			isPaused: () => false,
			isOnCooldown: () => false,
			setPaused: () => {},
			markReplied: () => {},
		}));
		const { evaluateMessage } = await import("../../src/state/trigger.js");
		const msg = makeMsg({ content: "Pixie is great" });
		const r = evaluateMessage(msg as any, "b1", "Luna");
		expect(r.shouldRespond).toBeTrue();
		expect(r.reason).toBe("name");
	});

	it("responds to keyword", async () => {
		mock.module("../../src/state/state.js", () => ({
			isPaused: () => false,
			isOnCooldown: () => false,
			setPaused: () => {},
			markReplied: () => {},
		}));
		const { evaluateMessage } = await import("../../src/state/trigger.js");
		const msg = makeMsg({ content: "I need help" });
		const r = evaluateMessage(msg as any, "b1", "Luna");
		expect(r.shouldRespond).toBeTrue();
		expect(r.reason).toBe("keyword");
	});

	it("responds to follow-up", async () => {
		mock.module("../../src/state/state.js", () => ({
			isPaused: () => false,
			isOnCooldown: () => false,
			setPaused: () => {},
			markReplied: () => {},
		}));
		const { evaluateMessage } = await import("../../src/state/trigger.js");
		const msg = makeMsg({ content: "what do you think?" });
		const r = evaluateMessage(msg as any, "b1", "Luna", true);
		expect(r.shouldRespond).toBeTrue();
		expect(r.reason).toBe("follow-up");
	});

	it("responds to random chance", async () => {
		mock.module("../../src/state/state.js", () => ({
			isPaused: () => false,
			isOnCooldown: () => false,
			setPaused: () => {},
			markReplied: () => {},
		}));
		mockConfig({ randomChance: 1 });
		const { evaluateMessage } = await import("../../src/state/trigger.js");
		const msg = makeMsg({ content: "some random message" });
		const r = evaluateMessage(msg as any, "b1", "Luna");
		expect(r.shouldRespond).toBeTrue();
		expect(r.reason).toBe("random");
	});

	it("returns false when nothing triggers", async () => {
		mock.module("../../src/state/state.js", () => ({
			isPaused: () => false,
			isOnCooldown: () => false,
			setPaused: () => {},
			markReplied: () => {},
		}));
		mockConfig({ randomChance: 0 });
		const { evaluateMessage } = await import("../../src/state/trigger.js");
		const msg = makeMsg({ content: "just a regular message" });
		const r = evaluateMessage(msg as any, "b1", "Luna");
		expect(r.shouldRespond).toBeFalse();
		expect(r.reason).toBeNull();
	});

	it("respects word boundaries for name", async () => {
		mock.module("../../src/state/state.js", () => ({
			isPaused: () => false,
			isOnCooldown: () => false,
			setPaused: () => {},
			markReplied: () => {},
		}));
		mockConfig({ randomChance: 0 });
		const { evaluateMessage } = await import("../../src/state/trigger.js");
		const msg = makeMsg({ content: "lunatic" });
		const r = evaluateMessage(msg as any, "b1", "Luna");
		expect(r.shouldRespond).toBeFalse();
	});

	it("matches name case-insensitively", async () => {
		mock.module("../../src/state/state.js", () => ({
			isPaused: () => false,
			isOnCooldown: () => false,
			setPaused: () => {},
			markReplied: () => {},
		}));
		mockConfig({ randomChance: 0 });
		const { evaluateMessage } = await import("../../src/state/trigger.js");
		const msg = makeMsg({ content: "Hello LUNA" });
		const r = evaluateMessage(msg as any, "b1", "Luna");
		expect(r.shouldRespond).toBeTrue();
		expect(r.reason).toBe("name");
	});

	it("sets botName from guild nick", async () => {
		mock.module("../../src/state/state.js", () => ({
			isPaused: () => false,
			isOnCooldown: () => false,
			setPaused: () => {},
			markReplied: () => {},
		}));
		mockConfig({ randomChance: 0 });
		const { evaluateMessage } = await import("../../src/state/trigger.js");
		const members = new Map();
		members.set("b1", { nick: "TestBot" });
		const msg = makeMsg({
			content: "hello",
			channel: { id: "c1", type: 0, guild: { members } },
		});
		const r = evaluateMessage(msg as any, "b1", "Luna");
		expect(r.botName).toBe("TestBot");
	});
});
