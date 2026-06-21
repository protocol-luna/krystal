import { describe, it, expect, beforeAll, mock } from "bun:test";

describe("loadState", () => {
	beforeAll(() => {
		mock.module("../../src/state/state-bus.js", () => ({
			stateBus: { on() {}, emit() {} },
		}));
	});

	it("returns default state when file does not exist", async () => {
		mock.module("node:fs/promises", () => ({
			readFile: async () => {
				throw new Error("ENOENT");
			},
			writeFile: async () => {},
		}));
		const { loadState } = await import("../../src/state/persistence.js");
		const state = await loadState();
		expect(state.paused).toBeFalse();
		expect(state.pendingMessages).toEqual([]);
	});

	it("loads paused state from file", async () => {
		mock.module("node:fs/promises", () => ({
			readFile: async () =>
				JSON.stringify({
					paused: true,
					pendingMessages: [],
					channelCooldowns: [],
					botActivity: [],
					lastSpeaker: [],
					responseCount: [],
					topicWordLogs: [],
				}),
			writeFile: async () => {},
		}));
		const { loadState } = await import("../../src/state/persistence.js");
		const state = await loadState();
		expect(state.paused).toBeTrue();
	});

	it("returns default state for invalid JSON", async () => {
		mock.module("node:fs/promises", () => ({
			readFile: async () => "not json",
			writeFile: async () => {},
		}));
		const { loadState } = await import("../../src/state/persistence.js");
		const state = await loadState();
		expect(state.paused).toBeFalse();
	});

	it("returns default state for missing paused field", async () => {
		mock.module("node:fs/promises", () => ({
			readFile: async () => JSON.stringify({ pendingMessages: [] }),
			writeFile: async () => {},
		}));
		const { loadState } = await import("../../src/state/persistence.js");
		const state = await loadState();
		expect(state.paused).toBeFalse();
	});
});

describe("persistState", () => {
	beforeAll(() => {
		mock.module("../../src/state/state-bus.js", () => ({
			stateBus: { on() {}, emit() {} },
		}));
	});

	it("writes state to file", async () => {
		let written = "";
		mock.module("node:fs/promises", () => ({
			readFile: async () => {
				throw new Error("ENOENT");
			},
			writeFile: async (_path: string, data: string) => {
				written = data;
			},
		}));
		const { persistState } = await import("../../src/state/persistence.js");
		await persistState({
			paused: true,
			pendingMessages: [],
			channelCooldowns: [],
			botActivity: [],
			lastSpeaker: [],
			responseCount: [],
			topicWordLogs: [],
		});
		const parsed = JSON.parse(written);
		expect(parsed.paused).toBeTrue();
	});

	it("serializes pending messages", async () => {
		let written = "";
		mock.module("node:fs/promises", () => ({
			readFile: async () =>
				JSON.stringify({
					paused: false,
					pendingMessages: [
						{
							channelId: "123",
							messageId: "456",
							userId: "789",
							reason: "mention",
							timestamp: 1000,
						},
					],
					channelCooldowns: [],
					botActivity: [],
					lastSpeaker: [],
					responseCount: [],
				}),
			writeFile: async (_path: string, data: string) => {
				written = data;
			},
		}));
		const { persistState } = await import("../../src/state/persistence.js");
		await persistState({
			paused: false,
			pendingMessages: [
				{
					channelId: "123",
					messageId: "456",
					userId: "789",
					reason: "mention",
					timestamp: 1000,
				},
			],
			channelCooldowns: [],
			botActivity: [],
			lastSpeaker: [],
			responseCount: [],
			topicWordLogs: [],
		});
		const parsed = JSON.parse(written);
		expect(parsed.pendingMessages).toHaveLength(1);
		expect(parsed.pendingMessages[0].channelId).toBe("c1");
	});
});

describe("buildPending", () => {
	beforeAll(() => {
		mock.module("../../src/state/state-bus.js", () => ({
			stateBus: { on() {}, emit() {} },
		}));
	});

	it("converts Map to array", async () => {
		const { buildPending } = await import("../../src/state/persistence.js");
		const map = new Map([
			[
				"k1",
				{
					message: { id: "m1", channel: { id: "c1" }, author: { id: "u1" } },
					reason: "mention",
				},
			],
		]);
		const result = buildPending(map as any);
		expect(result).toHaveLength(1);
		expect(result[0].channelId).toBe("c1");
		expect(result[0].messageId).toBe("m1");
		expect(result[0].userId).toBe("u1");
		expect(result[0].reason).toBe("mention");
	});

	it("returns empty array for empty map", async () => {
		const { buildPending } = await import("../../src/state/persistence.js");
		const result = buildPending(new Map());
		expect(result).toEqual([]);
	});
});

describe("scheduleSave", () => {
	beforeAll(() => {
		mock.module("../../src/state/state-bus.js", () => ({
			stateBus: { on() {}, emit() {} },
		}));
	});

	it("debounces writes within 500ms", async () => {
		let writeCount = 0;
		mock.module("node:fs/promises", () => ({
			readFile: async () => {
				throw new Error("ENOENT");
			},
			writeFile: async () => {
				writeCount++;
			},
		}));
		const { scheduleSave } = await import("../../src/state/persistence.js");
		const state = {
			paused: false,
			pendingMessages: [],
			channelCooldowns: [],
			botActivity: [],
			lastSpeaker: [],
			responseCount: [],
			topicWordLogs: [],
		};
		scheduleSave(state);
		scheduleSave(state);
		scheduleSave(state);
		expect(writeCount).toBe(0); // not yet flushed
		await new Promise((r) => setTimeout(r, 600));
		expect(writeCount).toBe(1); // only one write after debounce
	});
});
