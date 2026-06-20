import { describe, it, expect } from "bun:test";

describe("isTextChannel", () => {
	it("returns true for type 0 (GuildText)", async () => {
		const { isTextChannel } = await import("../../src/guild.js");
		expect(isTextChannel({ type: 0 } as any)).toBeTrue();
	});

	it("returns true for type 5 (GuildNews)", async () => {
		const { isTextChannel } = await import("../../src/guild.js");
		expect(isTextChannel({ type: 5 } as any)).toBeTrue();
	});

	it("returns false for type 2 (GuildVoice)", async () => {
		const { isTextChannel } = await import("../../src/guild.js");
		expect(isTextChannel({ type: 2 } as any)).toBeFalse();
	});

	it("returns false for type 4 (GuildCategory)", async () => {
		const { isTextChannel } = await import("../../src/guild.js");
		expect(isTextChannel({ type: 4 } as any)).toBeFalse();
	});
});

describe("findMostActiveChannel", () => {
	it("returns null for empty guild", async () => {
		const { findMostActiveChannel } = await import("../../src/guild.js");
		const guild = { channels: new Map() };
		expect(findMostActiveChannel(guild as any)).toBeNull();
	});

	it("skips non-text channels", async () => {
		const { findMostActiveChannel } = await import("../../src/guild.js");
		const guild = {
			channels: new Map([
				["v1", { type: 2, lastMessageID: "100" }],
				["c1", { type: 4, lastMessageID: "200" }],
			]),
		};
		expect(findMostActiveChannel(guild as any)).toBeNull();
	});

	it("returns the channel with highest lastMessageID", async () => {
		const { findMostActiveChannel } = await import("../../src/guild.js");
		const guild = {
			channels: new Map([
				["c1", { type: 0, lastMessageID: "0500" }],
				["c2", { type: 0, lastMessageID: "1000" }],
				["c3", { type: 0, lastMessageID: "0200" }],
			]),
		};
		const result = findMostActiveChannel(guild as any);
		expect(result).toBeDefined();
		expect(result!.lastMessageID).toBe("1000");
	});

	it("returns text channel when voice channels exist with higher IDs", async () => {
		const { findMostActiveChannel } = await import("../../src/guild.js");
		const guild = {
			channels: new Map([
				["v1", { type: 2, lastMessageID: "9999" }],
				["c1", { type: 0, lastMessageID: "0500" }],
			]),
		};
		const result = findMostActiveChannel(guild as any);
		expect(result).toBeDefined();
		expect(result!.lastMessageID).toBe("0500");
	});
});
