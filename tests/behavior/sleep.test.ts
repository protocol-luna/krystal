import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mockConfig } from "../../tests/_mock-config.js";

describe("getSleepBehavior enabled", () => {
	beforeAll(() => {
		process.env.TZ = "UTC";
		mockConfig({
			timezone: "UTC",
			timeSchedules: [{ start: "00:00", end: "23:59", behavior: "sleep" }],
		});
	});
	afterAll(() => {
		delete process.env.TZ;
	});

	it("returns 'sleep' when inside the window", async () => {
		const { getSleepBehavior } = await import("../../src/behavior/sleep.js");
		expect(getSleepBehavior()).toBe("sleep");
	});
});

describe("getSleepBehavior slow", () => {
	beforeAll(() => {
		process.env.TZ = "UTC";
		mockConfig({
			timezone: "UTC",
			timeSchedules: [{ start: "00:00", end: "23:59", behavior: "slow" }],
		});
	});
	afterAll(() => {
		delete process.env.TZ;
	});

	it("returns 'slow' when inside the window", async () => {
		const { getSleepBehavior } = await import("../../src/behavior/sleep.js");
		expect(getSleepBehavior()).toBe("slow");
	});
});

describe("getSleepBehavior short", () => {
	beforeAll(() => {
		process.env.TZ = "UTC";
		mockConfig({
			timezone: "UTC",
			timeSchedules: [{ start: "00:00", end: "23:59", behavior: "short" }],
		});
	});
	afterAll(() => {
		delete process.env.TZ;
	});

	it("returns 'short' when inside the window", async () => {
		const { getSleepBehavior } = await import("../../src/behavior/sleep.js");
		expect(getSleepBehavior()).toBe("short");
	});
});

describe("getSleepBehavior disabled", () => {
	beforeAll(() => {
		mockConfig({
			timeSchedules: [],
		});
	});

	it("returns null when no schedules", async () => {
		const { getSleepBehavior } = await import("../../src/behavior/sleep.js");
		expect(getSleepBehavior()).toBeNull();
	});
});

describe("getSleepBehavior outside window", () => {
	beforeAll(() => {
		mockConfig({
			timezone: "UTC",
			timeSchedules: [{ start: "23:00", end: "00:00", behavior: "sleep" }],
		});
	});

	it("returns null when current time is outside all windows", async () => {
		const { getSleepBehavior } = await import("../../src/behavior/sleep.js");
		// Current time is not 23:00-00:00, so returns null
		expect(getSleepBehavior()).toBeNull();
	});
});

describe("getSleepBehavior multiple windows", () => {
	beforeAll(() => {
		process.env.TZ = "UTC";
		mockConfig({
			timezone: "UTC",
			timeSchedules: [
				{ start: "00:00", end: "23:59", behavior: "short" },
				{ start: "00:00", end: "23:59", behavior: "sleep" },
			],
		});
	});
	afterAll(() => {
		delete process.env.TZ;
	});

	it("picks the first matching window", async () => {
		const { getSleepBehavior } = await import("../../src/behavior/sleep.js");
		expect(getSleepBehavior()).toBe("short");
	});
});

describe("getSleepBehavior entry without behavior", () => {
	beforeAll(() => {
		process.env.TZ = "UTC";
		mockConfig({
			timezone: "UTC",
			timeSchedules: [
				{ start: "00:00", end: "23:59" }, // no behavior = normal
			],
		});
	});
	afterAll(() => {
		delete process.env.TZ;
	});

	it("returns null when window matches but has no behavior", async () => {
		const { getSleepBehavior } = await import("../../src/behavior/sleep.js");
		expect(getSleepBehavior()).toBeNull();
	});
});
