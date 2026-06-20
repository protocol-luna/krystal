import { describe, it, expect, beforeAll, beforeEach, mock } from "bun:test";

function mockDeps() {
	mock.module("../../src/state/persistence.js", () => ({
		buildPending: (_m: Map<string, unknown>) => {
			return [
				{
					channelId: "c1",
					messageId: "m1",
					userId: "u1",
					reason: "mention",
					timestamp: Date.now(),
				},
			];
		},
		scheduleSave: () => {},
	}));
	mock.module("../../src/state/state.js", () => ({
		dumpState: () => ({
			channelCooldowns: [],
			botActivity: [],
			lastSpeaker: [],
			responseCount: [],
			paused: false,
		}),
	}));
}

describe("pendingKey", () => {
	beforeAll(() => mockDeps());

	it("creates composite key", async () => {
		const { pendingKey } = await import("../../src/bot/pending.js");
		expect(pendingKey("c1", "u1")).toBe("c1:u1");
		expect(pendingKey("abc", "xyz")).toBe("abc:xyz");
	});
});

describe("processing set", () => {
	beforeAll(() => mockDeps());
	beforeEach(async () => {
		const mod = await import("../../src/bot/pending.js");
		mod.processing.clear();
	});

	it("starts empty", async () => {
		const mod = await import("../../src/bot/pending.js");
		expect(mod.isProcessing("c1:u1")).toBeFalse();
	});

	it("tracks processing state", async () => {
		const mod = await import("../../src/bot/pending.js");
		mod.markProcessing("c1:u1");
		expect(mod.isProcessing("c1:u1")).toBeTrue();
		mod.doneProcessing("c1:u1");
		expect(mod.isProcessing("c1:u1")).toBeFalse();
	});
});

describe("pendingMessages", () => {
	beforeAll(() => mockDeps());
	beforeEach(async () => {
		const mod = await import("../../src/bot/pending.js");
		mod.pendingMessages.clear();
	});

	it("hasPending returns false for unknown key", async () => {
		const mod = await import("../../src/bot/pending.js");
		expect(mod.hasPending("c1:u1")).toBeFalse();
	});

	it("queuePending adds pending message", async () => {
		const mod = await import("../../src/bot/pending.js");
		const msg = {
			id: "m1",
			content: "hello",
			channel: { id: "c1" },
			author: { id: "u1" },
		};
		mod.queuePending("c1:u1", msg as any, "mention");
		expect(mod.hasPending("c1:u1")).toBeTrue();
	});

	it("drainPending returns queued message", async () => {
		const mod = await import("../../src/bot/pending.js");
		const msg = {
			id: "m1",
			content: "hello",
			channel: { id: "c1" },
			author: { id: "u1" },
		};
		mod.queuePending("c1:u1", msg as any, "mention");
		const drained = mod.drainPending("c1:u1");
		expect(drained).not.toBeNull();
		expect(drained!.message).toBe(msg);
		expect(drained!.reason).toBe("mention");
	});

	it("drainPending removes from map", async () => {
		const mod = await import("../../src/bot/pending.js");
		const msg = {
			id: "m1",
			content: "hello",
			channel: { id: "c1" },
			author: { id: "u1" },
		};
		mod.queuePending("c1:u1", msg as any, "mention");
		mod.drainPending("c1:u1");
		expect(mod.hasPending("c1:u1")).toBeFalse();
	});

	it("drainPending returns null for unknown key", async () => {
		const mod = await import("../../src/bot/pending.js");
		expect(mod.drainPending("unknown")).toBeNull();
	});
});

describe("saveAllState", () => {
	beforeAll(() => mockDeps());

	it("calls scheduleSave with dumpState data", async () => {
		let saved: unknown = null;
		mock.module("../../src/state/persistence.js", () => ({
			buildPending: () => [],
			scheduleSave: (s: unknown) => {
				saved = s;
			},
		}));
		const { saveAllState, pendingMessages } = await import(
			"../../src/bot/pending.js"
		);
		pendingMessages.clear();
		saveAllState();
		expect(saved).not.toBeNull();
	});
});

describe("restorePending", () => {
	beforeAll(() => mockDeps());

	it("skips entries for already-processing keys", async () => {
		const mod = await import("../../src/bot/pending.js");
		mod.pendingMessages.clear();
		mod.processing.clear();
		mod.markProcessing("c1:u1");

		const client = {
			getChannel: () => null,
			getMessage: async () => ({ id: "m1" }),
		};
		await mod.restorePending(
			[{ channelId: "c1", messageId: "m1", userId: "u1", reason: "mention" }],
			client as any
		);
		expect(mod.hasPending("c1:u1")).toBeFalse();
	});

	it("skips when channel is inaccessible", async () => {
		const mod = await import("../../src/bot/pending.js");
		mod.pendingMessages.clear();
		mod.processing.clear();

		const client = {
			getChannel: () => null,
			getMessage: async () => ({ id: "m1" }),
		};
		await mod.restorePending(
			[{ channelId: "c1", messageId: "m1", userId: "u1", reason: "mention" }],
			client as any
		);
		expect(mod.hasPending("c1:u1")).toBeFalse();
	});
});
