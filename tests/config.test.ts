import { describe, it, expect } from "bun:test";
import { mockConfig } from "./_mock-config.js";

describe("config getters", () => {
	it("uses default values", async () => {
		mockConfig();
		const { config } = await import("../src/config.js");
		expect(config.names).toEqual(["Luna", "Pixie"]);
		expect(config.keywords.length).toBeGreaterThan(0);
		expect(config.cooldownSeconds).toBe(8);
		expect(config.randomChance).toBe(0.015);
		expect(config.typingWpm).toBe(300);
	});

	it("loads names from override", async () => {
		mockConfig({ names: ["Alpha", "Beta"] });
		const { config } = await import("../src/config.js");
		expect(config.names).toEqual(["Alpha", "Beta"]);
	});

	it("loads cooldown_seconds from override", async () => {
		mockConfig({ cooldownSeconds: 15 });
		const { config } = await import("../src/config.js");
		expect(config.cooldownSeconds).toBe(15);
	});

	it("merges partial concentration with defaults", async () => {
		mockConfig({
			concentration: {
				mention: { delay_min: 100, delay_max: 500, ignore_chance: 0, reaction_chance: 0 },
				dm: { delay_min: 400, delay_max: 1800, ignore_chance: 0, reaction_chance: 0.05 },
				name: { delay_min: 800, delay_max: 4000, ignore_chance: 0.05, reaction_chance: 0.06 },
				keyword: { delay_min: 1000, delay_max: 3500, ignore_chance: 0.08, reaction_chance: 0.04 },
				"follow-up": { delay_min: 500, delay_max: 2000, ignore_chance: 0, reaction_chance: 0.03 },
				random: { delay_min: 1500, delay_max: 5000, ignore_chance: 0.15, reaction_chance: 0.02 },
				default: { delay_min: 800, delay_max: 4000, ignore_chance: 0.08, reaction_chance: 0.06 },
			},
		});
		const { config } = await import("../src/config.js");
		expect(config.concentration.mention.delay_min).toBe(100);
		expect(config.concentration.dm.delay_min).toBe(400);
	});

	it("reads sleep schedule", async () => {
		mockConfig({
			sleepSchedule: { enabled: true, start: "22:00", end: "07:00", timezone: "Europe/Paris", behavior: "slow" },
		});
		const { config } = await import("../src/config.js");
		expect(config.sleepSchedule.enabled).toBeTrue();
		expect(config.sleepSchedule.start).toBe("22:00");
		expect(config.sleepSchedule.behavior).toBe("slow");
	});

	it("reads typing WPM", async () => {
		mockConfig({ typingWpm: 150 });
		const { config } = await import("../src/config.js");
		expect(config.typingWpm).toBe(150);
	});

	it("reads hesitation config", async () => {
		mockConfig({ hesitationChance: 0.3, hesitationWords: ["uh...", "hmm..."] });
		const { config } = await import("../src/config.js");
		expect(config.hesitationChance).toBe(0.3);
		expect(config.hesitationWords).toEqual(["uh...", "hmm..."]);
	});

	it("reads forget chance", async () => {
		mockConfig({ forgetChance: 0.1 });
		const { config } = await import("../src/config.js");
		expect(config.forgetChance).toBe(0.1);
	});

	it("reads inactivity warmup", async () => {
		mockConfig({ inactivityWarmupMinutes: 5, inactivityWarmupMultiplier: 3 });
		const { config } = await import("../src/config.js");
		expect(config.inactivityWarmupMinutes).toBe(5);
		expect(config.inactivityWarmupMultiplier).toBe(3);
	});

	it("reads dynamic status presets", async () => {
		mockConfig({
			dynamicStatus: [
				{ status: "online", text: "with friends", type: 0 },
				{ status: "idle", text: "coding", type: 3 },
			],
		});
		const { config } = await import("../src/config.js");
		expect(config.dynamicStatus).toHaveLength(2);
		expect(config.dynamicStatus[0].text).toBe("with friends");
		expect(config.dynamicStatusIntervalMinutes).toBe(15);
	});

	it("reads reply styles", async () => {
		mockConfig({
			replyStyles: [{ message_reference: true, mention_replied_user: true, weight: 100 }],
		});
		const { config } = await import("../src/config.js");
		expect(config.replyStyles).toHaveLength(1);
		expect(config.replyStyles[0].message_reference).toBeTrue();
		expect(config.replyStyles[0].weight).toBe(100);
	});
});

describe("config.static exports", () => {
	it("exports DISCORD_TOKEN", async () => {
		mockConfig();
		const mod = await import("../src/config.js");
		expect(typeof mod.DISCORD_TOKEN).toBe("string");
		expect(mod.DISCORD_TOKEN).toBe("mock_token");
	});

	it("exports LLM_HOST default", async () => {
		mockConfig();
		const mod = await import("../src/config.js");
		expect(mod.LLM_HOST).toBe("localhost");
	});

	it("exports LLM_PORT default", async () => {
		mockConfig();
		const mod = await import("../src/config.js");
		expect(mod.LLM_PORT).toBe(3124);
	});

	it("exports llamaArgs array", async () => {
		mockConfig();
		const mod = await import("../src/config.js");
		expect(Array.isArray(mod.llamaArgs)).toBeTrue();
	});

	it("exports setLLMMode", async () => {
		mockConfig();
		const mod = await import("../src/config.js");
		expect(typeof mod.setLLMMode).toBe("function");
	});

	it("exports watchConfig", async () => {
		mockConfig();
		const mod = await import("../src/config.js");
		expect(typeof mod.watchConfig).toBe("function");
	});

	it("exports pickReplyStyle", async () => {
		mockConfig();
		const mod = await import("../src/config.js");
		expect(typeof mod.pickReplyStyle).toBe("function");
	});
});
