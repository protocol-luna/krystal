import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";

function mockSleepSchedule(overrides: Record<string, unknown> = {}) {
	mock.module("../../src/config.js", () => ({
		config: {
			get sleepSchedule() {
				return {
					enabled: true,
					start: "00:00",
					end: "23:59",
					timezone: "UTC",
					behavior: "sleep",
					...overrides,
				};
			},
		},
	}));
}

describe("getSleepBehavior enabled", () => {
	beforeAll(() => {
		process.env.TZ = "UTC";
		mockSleepSchedule();
	});
	afterAll(() => {
		delete process.env.TZ;
	});

	it("returns sleep behavior inside window", async () => {
		const { getSleepBehavior } = await import("../../src/behavior/sleep.js");
		expect(getSleepBehavior()).toBe("sleep");
	});
});

describe("getSleepBehavior slow", () => {
	beforeAll(() => {
		process.env.TZ = "UTC";
		mockSleepSchedule({ behavior: "slow" });
	});
	afterAll(() => {
		delete process.env.TZ;
	});

	it("returns slow behavior", async () => {
		const { getSleepBehavior } = await import("../../src/behavior/sleep.js");
		expect(getSleepBehavior()).toBe("slow");
	});
});

describe("getSleepBehavior short", () => {
	beforeAll(() => {
		process.env.TZ = "UTC";
		mockSleepSchedule({ behavior: "short" });
	});
	afterAll(() => {
		delete process.env.TZ;
	});

	it("returns short behavior", async () => {
		const { getSleepBehavior } = await import("../../src/behavior/sleep.js");
		expect(getSleepBehavior()).toBe("short");
	});
});

describe("getSleepBehavior disabled", () => {
	beforeAll(() => {
		mock.module("../../src/config.js", () => ({
			config: {
				get sleepSchedule() {
					return { enabled: false };
				},
			},
		}));
	});

	it("returns null when disabled", async () => {
		const { getSleepBehavior } = await import("../../src/behavior/sleep.js");
		expect(getSleepBehavior()).toBeNull();
	});
});

describe("getSleepBehavior outside window", () => {
	beforeAll(() => {
		mock.module("../../src/config.js", () => ({
			config: {
				get sleepSchedule() {
					return {
						enabled: true,
						start: "23:00",
						end: "00:00",
						timezone: "UTC",
						behavior: "sleep",
					};
				},
			},
		}));
	});

	it("returns null when current time is outside window", async () => {
		const { getSleepBehavior } = await import("../../src/behavior/sleep.js");
		expect(getSleepBehavior()).toBeNull();
	});
});
