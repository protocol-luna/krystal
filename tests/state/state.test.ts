import { describe, it, expect, beforeAll, afterAll, beforeEach, } from "bun:test";
import { mockConfig } from "../_mock-config.js";

const originalDateNow = Date.now;
let fakeNow = 1_000_000_000_000;

describe("isPaused / setPaused", () => {
	beforeAll(() => {
		mockConfig();
	});

	it("starts unpaused", async () => {
		const mod = await import("../../src/state/state.js");
		expect(mod.isPaused()).toBeFalse();
	});

	it("setPaused(true) pauses", async () => {
		const mod = await import("../../src/state/state.js");
		mod.setPaused(true);
		expect(mod.isPaused()).toBeTrue();
		mod.setPaused(false);
	});

	it("setPaused(false) unpauses", async () => {
		const mod = await import("../../src/state/state.js");
		mod.setPaused(true);
		mod.setPaused(false);
		expect(mod.isPaused()).toBeFalse();
	});
});

describe("markReplied / isOnCooldown", () => {
	beforeAll(() => {
		mockConfig();
		Date.now = () => fakeNow;
	});
	afterAll(() => {
		Date.now = originalDateNow;
	});
	beforeEach(() => {
		fakeNow = 1_000_000_000_000;
	});

	it("no cooldown initially", async () => {
		const mod = await import("../../src/state/state.js");
		mod.clearCooldown("c1");
		expect(mod.isOnCooldown("c1")).toBeFalse();
	});

	it("on cooldown after markReplied", async () => {
		const mod = await import("../../src/state/state.js");
		mod.clearCooldown("c1");
		mod.markReplied("c1");
		expect(mod.isOnCooldown("c1")).toBeTrue();
	});

	it("cooldown expires after config.cooldownSeconds", async () => {
		const mod = await import("../../src/state/state.js");
		mod.clearCooldown("c1");
		mod.markReplied("c1");
		fakeNow += 8_001;
		expect(mod.isOnCooldown("c1")).toBeFalse();
	});
});

describe("botActivity", () => {
	beforeAll(() => {
		mockConfig();
		Date.now = () => fakeNow;
	});
	afterAll(() => {
		Date.now = originalDateNow;
	});
	beforeEach(() => {
		fakeNow = 1_000_000_000_000;
	});

	it("no activity initially", async () => {
		const mod = await import("../../src/state/state.js");
		mod.clearCooldown("c1");
		expect(mod.isRecentBotActivity("c1")).toBeFalse();
	});

	it("recent after markReplied", async () => {
		const mod = await import("../../src/state/state.js");
		mod.clearCooldown("c1");
		mod.markReplied("c1");
		expect(mod.isRecentBotActivity("c1", 30000)).toBeTrue();
	});

	it("expires after window", async () => {
		const mod = await import("../../src/state/state.js");
		mod.clearCooldown("c1");
		mod.markReplied("c1");
		fakeNow += 20_000;
		expect(mod.isRecentBotActivity("c1", 15000)).toBeFalse();
	});

	it("markBotActivity updates activity", async () => {
		const mod = await import("../../src/state/state.js");
		mod.clearCooldown("c1");
		mod.markBotActivity("c1");
		expect(mod.isRecentBotActivity("c1")).toBeTrue();
	});
});

describe("globalInactivity", () => {
	beforeAll(() => {
		mockConfig();
		Date.now = () => fakeNow;
	});
	afterAll(() => {
		Date.now = originalDateNow;
	});
	beforeEach(() => {
		fakeNow = 1_000_000_000_000;
	});

	it("returns time since last activity", async () => {
		const mod = await import("../../src/state/state.js");
		mod.markReplied("c1");
		fakeNow += 5_000;
		const ms = mod.getGlobalInactivityMs();
		expect(ms).toBeGreaterThanOrEqual(5000);
	});
});

describe("trackSpeaker", () => {
	beforeAll(() => mockConfig());
	beforeEach(async () => {
		const mod = await import("../../src/state/state.js");
		mod.clearCooldown("c1");
	});

	it("returns undefined for first speaker", async () => {
		const mod = await import("../../src/state/state.js");
		const prev = mod.trackSpeaker("c1", "u1");
		expect(prev).toBeUndefined();
	});

	it("returns previous speaker on second call", async () => {
		const mod = await import("../../src/state/state.js");
		mod.trackSpeaker("c1", "u1");
		const prev = mod.trackSpeaker("c1", "u2");
		expect(prev).toBe("u1");
	});
});

describe("canFollowUp / isInConversation", () => {
	beforeAll(() => {
		mockConfig();
		Date.now = () => fakeNow;
	});
	afterAll(() => {
		Date.now = originalDateNow;
	});
	beforeEach(() => {
		fakeNow = 1_000_000_000_000;
	});

	it("cannot follow up without prior activity", async () => {
		const mod = await import("../../src/state/state.js");
		mod.clearCooldown("c1");
		expect(mod.canFollowUp("c1", "b1")).toBeFalse();
	});

	it("can follow up after bot reply", async () => {
		const mod = await import("../../src/state/state.js");
		mod.clearCooldown("c1");
		mod.markReplied("c1");
		mod.trackSpeaker("c1", "b1");
		expect(mod.canFollowUp("c1", "b1")).toBeTrue();
	});

	it("cannot follow up when max follow-ups exceeded", async () => {
		const mod = await import("../../src/state/state.js");
		mod.clearCooldown("c1");
		mod.markReplied("c1");
		mod.markReplied("c1");
		mod.markReplied("c1");
		mod.trackSpeaker("c1", "b1");
		expect(mod.canFollowUp("c1", "b1")).toBeFalse();
	});

	it("isInConversation returns true within window", async () => {
		const mod = await import("../../src/state/state.js");
		mod.clearCooldown("c1");
		mod.markReplied("c1");
		mod.trackSpeaker("c1", "b1");
		expect(mod.isInConversation("c1", "b1")).toBeTrue();
	});

	it("isInConversation returns false after window", async () => {
		const mod = await import("../../src/state/state.js");
		mod.clearCooldown("c1");
		mod.markReplied("c1");
		mod.trackSpeaker("c1", "b1");
		fakeNow += 20_000;
		expect(mod.isInConversation("c1", "b1")).toBeFalse();
	});
});

describe("clearCooldown", () => {
	beforeAll(() => mockConfig());

	it("clears all channel state", async () => {
		const mod = await import("../../src/state/state.js");
		mod.clearCooldown("c1");
		mod.markReplied("c1");
		mod.trackSpeaker("c1", "u1");
		expect(mod.isOnCooldown("c1")).toBeTrue();
		mod.clearCooldown("c1");
		expect(mod.isOnCooldown("c1")).toBeFalse();
	});
});

describe("dumpState / restoreState", () => {
	beforeAll(() => {
		mockConfig();
		Date.now = () => fakeNow;
	});
	afterAll(() => {
		Date.now = originalDateNow;
	});
	beforeEach(() => {
		fakeNow = 1_000_000_000_000;
	});

	it("roundtrips through dumpState and restoreState", async () => {
		const mod = await import("../../src/state/state.js");
		mod.clearCooldown("c1");
		mod.markReplied("c1");
		mod.setPaused(true);
		const data = mod.dumpState();
		expect(data.paused).toBeTrue();
		expect(data.channelCooldowns.length).toBeGreaterThanOrEqual(1);
		expect(data.botActivity.length).toBeGreaterThanOrEqual(1);
	});

	it("restoreState restores paused state", async () => {
		const mod = await import("../../src/state/state.js");
		mod.clearCooldown("c1");
		mod.setPaused(false);
		mod.restoreState({
			channelCooldowns: [],
			botActivity: [],
			lastSpeaker: [],
			responseCount: [],
			paused: true,
		});
		expect(mod.isPaused()).toBeTrue();
	});
});

describe("startPruning", () => {
	beforeAll(() => {
		mockConfig();
		Date.now = () => fakeNow;
	});
	afterAll(() => {
		Date.now = originalDateNow;
	});
	beforeEach(() => {
		fakeNow = 1_000_000_000_000;
	});

	it("cleans up old entries", async () => {
		const mod = await import("../../src/state/state.js");
		mod.clearCooldown("c1");
		mod.markReplied("c1");
		fakeNow += 3_600_000 + 1;
		mod.startPruning();
		await new Promise(r => setTimeout(r, 50));
		expect(mod.isOnCooldown("c1")).toBeFalse();
	});
});
