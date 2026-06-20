import { describe, it, expect, beforeAll } from "bun:test";
import { mockConfig } from "../_mock-config.js";

describe("applyTypoCorrection", () => {
	beforeAll(() => {
		mockConfig({
			typoCorrectionDelay: 2000,
			typoCorrectionDelayMax: 4000,
			typoCorrectionStyle: "edit",
		});
	});

	it("edits message for edit style", async () => {
		mockConfig({ typoCorrectionStyle: "edit" });
		const { applyTypoCorrection } = await import(
			"../../src/bot/typo-correction.js"
		);
		let edited = false;
		const client = {
			editMessage: async () => {
				edited = true;
			},
			createMessage: async () => {},
		};
		await applyTypoCorrection(client as any, "c1", "m1", {
			chunkIndex: 0,
			original: "hello world",
			correctedWord: "hello",
		});
		expect(edited).toBeTrue();
	});

	it("creates correction message for message style", async () => {
		mockConfig({ typoCorrectionStyle: "message" });
		const { applyTypoCorrection } = await import(
			"../../src/bot/typo-correction.js"
		);
		let created = "";
		const client = {
			editMessage: async () => {},
			createMessage: async (_id: string, opts: any) => {
				created = opts.content;
			},
		};
		await applyTypoCorrection(client as any, "c1", "m1", {
			chunkIndex: 0,
			original: "hello world",
			correctedWord: "hello",
		});
		expect(created).toBe("hello*");
	});
});

describe("resolveStyle", () => {
	it("returns edit when config is edit", async () => {
		mockConfig({ typoCorrectionStyle: "edit" });
		// private function, tested via applyTypoCorrection
		const { applyTypoCorrection } = await import(
			"../../src/bot/typo-correction.js"
		);
		let style: string | null = null;
		const client = {
			editMessage: async () => {
				style = "edit";
			},
			createMessage: async () => {
				style = "message";
			},
		};
		await applyTypoCorrection(client as any, "c1", "m1", {
			chunkIndex: 0,
			original: "test",
			correctedWord: "test",
		});
		expect(style as string | null).toBe("edit");
	});

	it("returns message when config is message", async () => {
		mockConfig({ typoCorrectionStyle: "message" });
		const { applyTypoCorrection } = await import(
			"../../src/bot/typo-correction.js"
		);
		let style: string | null = null;
		const client = {
			editMessage: async () => {
				style = "edit";
			},
			createMessage: async () => {
				style = "message";
			},
		};
		await applyTypoCorrection(client as any, "c1", "m1", {
			chunkIndex: 0,
			original: "test",
			correctedWord: "test",
		});
		expect(style as string | null).toBe("message");
	});

	it("handles errors gracefully", async () => {
		mockConfig({ typoCorrectionStyle: "edit" });
		const { applyTypoCorrection } = await import(
			"../../src/bot/typo-correction.js"
		);
		const client = {
			editMessage: async () => {
				throw new Error("fail");
			},
			createMessage: async () => {},
		};
		// Should not throw
		await applyTypoCorrection(client as any, "c1", "m1", {
			chunkIndex: 0,
			original: "test",
			correctedWord: "test",
		});
	});
});
