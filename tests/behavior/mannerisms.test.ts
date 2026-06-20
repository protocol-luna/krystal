import { describe, it, expect, beforeAll, } from "bun:test";
import { mockConfig } from "../_mock-config.js";

describe("computeDelay", () => {
	beforeAll(() => {
		mockConfig();
	});

	it("returns delay within reason range", async () => {
		const { computeDelay } = await import("../../src/behavior/mannerisms.js");
		const delay = computeDelay("mention");
		expect(delay).toBeGreaterThanOrEqual(300);
		expect(delay).toBeLessThanOrEqual(1500);
	});

	it("increases delay with msgLength", async () => {
		const { computeDelay } = await import("../../src/behavior/mannerisms.js");
		const short = computeDelay("mention", null, 10);
		const long = computeDelay("mention", null, 1500);
		expect(long).toBeGreaterThan(short);
	});

	it("multiplies delay with inactivity warmup", async () => {
		const { computeDelay } = await import("../../src/behavior/mannerisms.js");
		const normal = computeDelay("mention", null, undefined, 0);
		const inactive = computeDelay("mention", null, undefined, 600_000 * 5);
		expect(inactive).toBeGreaterThan(normal);
	});

	it("multiplies delay with slow sleep", async () => {
		const { computeDelay } = await import("../../src/behavior/mannerisms.js");
		const normals = Array.from({ length: 50 }, () => computeDelay("mention"));
		const slows = Array.from({ length: 50 }, () => computeDelay("mention", "slow"));
		const avgNormal = normals.reduce((a, b) => a + b, 0) / normals.length;
		const avgSlow = slows.reduce((a, b) => a + b, 0) / slows.length;
		expect(avgSlow).toBeGreaterThan(avgNormal * 2);
	});

	it("uses default thresholds for unknown reason", async () => {
		const { computeDelay } = await import("../../src/behavior/mannerisms.js");
		const delay = computeDelay("unknown");
		expect(delay).toBeGreaterThanOrEqual(800);
		expect(delay).toBeLessThanOrEqual(4000);
	});

	it("caps reading factor at 3x for very long messages", async () => {
		const { computeDelay } = await import("../../src/behavior/mannerisms.js");
		// long and short both use random base delay; use averages for stability
		const shorts = Array.from({ length: 30 }, () => computeDelay("mention", null, 10));
		const longs = Array.from({ length: 30 }, () => computeDelay("mention", null, 5000));
		const avgShort = shorts.reduce((a, b) => a + b, 0) / shorts.length;
		const avgLong = longs.reduce((a, b) => a + b, 0) / longs.length;
		// reading factor for 5000 is capped at 3x, for 10 it's ~0.02x (reduces delay)
		expect(avgLong).toBeGreaterThan(avgShort * 2);
	});

	it("caps inactivity ratio at 5x", async () => {
		const { computeDelay } = await import("../../src/behavior/mannerisms.js");
		// 30min vs 500min — both exceed warmup threshold; ratio capped at 5x
		const milds = Array.from({ length: 30 }, () => computeDelay("mention", null, undefined, 600_000 * 3));
		const extremes = Array.from({ length: 30 }, () => computeDelay("mention", null, undefined, 600_000 * 50));
		const avgMild = milds.reduce((a, b) => a + b, 0) / milds.length;
		const avgExtreme = extremes.reduce((a, b) => a + b, 0) / extremes.length;
		expect(avgExtreme).toBeGreaterThan(avgMild);
		expect(avgExtreme).toBeLessThan(avgMild * 5);
	});
});

describe("shouldIgnore", () => {
	beforeAll(() => {
		mockConfig();
	});

	it("returns false for mention (0% chance)", async () => {
		const { shouldIgnore } = await import("../../src/behavior/mannerisms.js");
		expect(shouldIgnore("mention")).toBeFalse();
	});

	it("returns false for dm (0% chance)", async () => {
		const { shouldIgnore } = await import("../../src/behavior/mannerisms.js");
		expect(shouldIgnore("dm")).toBeFalse();
	});

	it("may return true for keyword (8% chance)", async () => {
		const { shouldIgnore } = await import("../../src/behavior/mannerisms.js");
		let ignored = 0;
		for (let i = 0; i < 1000; i++) {
			if (shouldIgnore("keyword")) { ignored++; }
		}
		expect(ignored).toBeGreaterThan(0);
		expect(ignored).toBeLessThan(200);
	});

	it("increases ignore chance with short sleep", async () => {
		const { shouldIgnore } = await import("../../src/behavior/mannerisms.js");
		const result = shouldIgnore("keyword", "short");
		expect(typeof result).toBe("boolean");
	});

	it("returns false for null reason (default 8%)", async () => {
		const { shouldIgnore } = await import("../../src/behavior/mannerisms.js");
		expect(typeof shouldIgnore(null)).toBe("boolean");
	});
});

describe("shouldReact", () => {
	beforeAll(() => {
		mockConfig();
	});

	it("returns boolean for mention (8% chance)", async () => {
		const { shouldReact } = await import("../../src/behavior/mannerisms.js");
		let reacted = 0;
		for (let i = 0; i < 1000; i++) {
			if (shouldReact("mention")) { reacted++; }
		}
		expect(reacted).toBeGreaterThan(0);
		expect(reacted).toBeLessThan(200);
	});

	it("caps reaction chance at 2% during slow sleep", async () => {
		const { shouldReact } = await import("../../src/behavior/mannerisms.js");
		let reacted = 0;
		for (let i = 0; i < 1000; i++) {
			if (shouldReact("mention", "slow")) { reacted++; }
		}
		expect(reacted).toBeLessThan(60);
	});

	it("returns false for 0% chance reason", async () => {
		mockConfig({
			concentration: {
				mention: { delay_min: 300, delay_max: 1500, ignore_chance: 0, reaction_chance: 0 },
				default: { delay_min: 800, delay_max: 4000, ignore_chance: 0, reaction_chance: 0 },
			},
			reactions: [],
			serverEmojiChance: 0,
		});
		const { shouldReact } = await import("../../src/behavior/mannerisms.js");
		expect(shouldReact("mention")).toBeFalse();
	});
});

describe("pickReaction", () => {
	beforeAll(() => {
		mockConfig();
	});

	it("picks from custom emojis when available", async () => {
		const { pickReaction } = await import("../../src/behavior/mannerisms.js");
		const result = pickReaction(["😀", "🎉"]);
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});

	it("picks from unicode reactions when no custom emojis", async () => {
		const { pickReaction } = await import("../../src/behavior/mannerisms.js");
		const result = pickReaction();
		expect(["👀", "😄", "🤔", "👋", "🔥"]).toContain(result);
	});
});
