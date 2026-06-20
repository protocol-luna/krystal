import { describe, it, expect } from "bun:test";

describe("stateBus", () => {
	it("exports a TypedBus singleton", async () => {
		const { stateBus } = await import("../../src/state/state-bus.js");
		expect(stateBus).toBeDefined();
		expect(typeof stateBus.on).toBe("function");
		expect(typeof stateBus.emit).toBe("function");
		expect(typeof stateBus.once).toBe("function");
		expect(typeof stateBus.off).toBe("function");
	});

	it("can emit and receive state:changed", async () => {
		const { stateBus } = await import("../../src/state/state-bus.js");
		let called = false;
		stateBus.once("state:changed", () => {
			called = true;
		});
		stateBus.emit("state:changed");
		expect(called).toBeTrue();
	});

	it("supports multiple listeners on state:changed", async () => {
		const { stateBus } = await import("../../src/state/state-bus.js");
		let count = 0;
		const fn1 = () => {
			count++;
		};
		const fn2 = () => {
			count++;
		};
		stateBus.on("state:changed", fn1);
		stateBus.on("state:changed", fn2);
		stateBus.emit("state:changed");
		expect(count).toBe(2);
		stateBus.off("state:changed", fn1);
		stateBus.off("state:changed", fn2);
	});
});
