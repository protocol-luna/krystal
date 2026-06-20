import { describe, it, expect } from "bun:test";

describe("llmBus", () => {
	it("exports a TypedBus singleton", async () => {
		const { llmBus } = await import("../../src/core/llm-bus.js");
		expect(llmBus).toBeDefined();
		expect(typeof llmBus.on).toBe("function");
		expect(typeof llmBus.emit).toBe("function");
		expect(typeof llmBus.once).toBe("function");
		expect(typeof llmBus.off).toBe("function");
	});

	it("can emit and receive token events", async () => {
		const { llmBus } = await import("../../src/core/llm-bus.js");
		let received = "";
		llmBus.once("token", (chunk: string) => {
			received = chunk;
		});
		llmBus.emit("token", "hello");
		expect(received).toBe("hello");
	});

	it("can emit and receive done events", async () => {
		const { llmBus } = await import("../../src/core/llm-bus.js");
		let text = "";
		llmBus.once("done", (full: string) => {
			text = full;
		});
		llmBus.emit("done", "full response");
		expect(text).toBe("full response");
	});

	it("can emit and receive error events", async () => {
		const { llmBus } = await import("../../src/core/llm-bus.js");
		let err: Error | null = null;
		llmBus.once("error", (e: Error) => {
			err = e;
		});
		const testErr = new Error("test error");
		llmBus.emit("error", testErr);
		expect(err).toBe(testErr);
	});

	it("can emit and receive crash events", async () => {
		const { llmBus } = await import("../../src/core/llm-bus.js");
		let code: number | null = -1;
		llmBus.once("crash", (c: number | null) => {
			code = c;
		});
		llmBus.emit("crash", 1);
		expect(code).toBe(1);
	});

	it("can emit and receive ready events", async () => {
		const { llmBus } = await import("../../src/core/llm-bus.js");
		let ready = false;
		llmBus.once("ready", () => {
			ready = true;
		});
		llmBus.emit("ready");
		expect(ready).toBeTrue();
	});

	it("can emit and receive reset events", async () => {
		const { llmBus } = await import("../../src/core/llm-bus.js");
		let reset = false;
		llmBus.once("reset", () => {
			reset = true;
		});
		llmBus.emit("reset");
		expect(reset).toBeTrue();
	});

	it("supports multiple listeners on same event", async () => {
		const { llmBus } = await import("../../src/core/llm-bus.js");
		let count = 0;
		const fn1 = () => {
			count++;
		};
		const fn2 = () => {
			count++;
		};
		llmBus.on("token", fn1);
		llmBus.on("token", fn2);
		llmBus.emit("token", "x");
		expect(count).toBe(2);
		llmBus.off("token", fn1);
		llmBus.off("token", fn2);
	});
});
