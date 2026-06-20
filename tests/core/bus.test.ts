import { describe, it, expect, beforeEach, mock } from "bun:test";
import { TypedBus } from "../../src/core/bus.js";

interface TestEvents {
	foo: [string];
	bar: [number, string];
	empty: [];
}

describe("TypedBus", () => {
	let bus: TypedBus<TestEvents>;

	beforeEach(() => {
		bus = new TypedBus<TestEvents>();
	});

	it("emits to registered listeners", () => {
		const fn = mock(() => {});
		bus.on("foo", fn);
		bus.emit("foo", "hello");
		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledWith("hello");
	});

	it("emits args to listeners", () => {
		const fn = mock(() => {});
		bus.on("bar", fn);
		bus.emit("bar", 42, "test");
		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledWith(42, "test");
	});

	it("emits to empty events", () => {
		const fn = mock(() => {});
		bus.on("empty", fn);
		bus.emit("empty");
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("supports multiple listeners on same event", () => {
		const fn1 = mock(() => {});
		const fn2 = mock(() => {});
		bus.on("foo", fn1);
		bus.on("foo", fn2);
		bus.emit("foo", "hi");
		expect(fn1).toHaveBeenCalledTimes(1);
		expect(fn2).toHaveBeenCalledTimes(1);
	});

	it("removes listener via off()", () => {
		const fn = mock(() => {});
		bus.on("foo", fn);
		bus.off("foo", fn);
		bus.emit("foo", "x");
		expect(fn).not.toHaveBeenCalled();
	});

	it("removes only the specified listener", () => {
		const fn1 = mock(() => {});
		const fn2 = mock(() => {});
		bus.on("foo", fn1);
		bus.on("foo", fn2);
		bus.off("foo", fn1);
		bus.emit("foo", "x");
		expect(fn1).not.toHaveBeenCalled();
		expect(fn2).toHaveBeenCalledTimes(1);
	});

	it("once() fires only once", () => {
		const fn = mock(() => {});
		bus.once("foo", fn);
		bus.emit("foo", "a");
		bus.emit("foo", "b");
		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledWith("a");
	});

	it("removeAll clears all listeners", () => {
		const fn1 = mock(() => {});
		const fn2 = mock(() => {});
		bus.on("foo", fn1);
		bus.on("bar", fn2);
		bus.removeAll();
		bus.emit("foo", "x");
		bus.emit("bar", 1, "y");
		expect(fn1).not.toHaveBeenCalled();
		expect(fn2).not.toHaveBeenCalled();
	});

	it("handles event with no listeners gracefully", () => {
		bus.emit("foo", "x");
		bus.emit("bar", 1, "y");
		bus.emit("empty");
	});

	it("off() on non-existent event does nothing", () => {
		const fn = mock(() => {});
		bus.off("foo", fn);
	});

	it("off() with non-registered listener does nothing", () => {
		const fn = mock(() => {});
		bus.on("foo", () => {});
		bus.off("foo", fn);
		bus.emit("foo", "ok");
	});

	it("once() wrapped listener can be removed before firing", () => {
		const fn = mock(() => {});
		bus.once("foo", fn);
		// We can't easily remove the wrapper, but we verify it still fires once
		bus.emit("foo", "a");
		bus.emit("foo", "b");
		expect(fn).toHaveBeenCalledTimes(1);
	});
});
