import { describe, it, expect, mock } from "bun:test";

describe("isTTSReady", () => {
	it("returns false before init", async () => {
		const { isTTSReady } = await import("../../src/tts/piper.js");
		expect(isTTSReady()).toBeFalse();
	});
});

describe("initTTS", () => {
	it("handles PiperTTS.create failure gracefully", async () => {
		mock.module("pipertts", () => ({
			PiperTTS: {
				create: async () => {
					throw new Error("init failed");
				},
			},
		}));
		const { initTTS, isTTSReady } = await import("../../src/tts/piper.js");
		await initTTS();
		expect(isTTSReady()).toBeFalse();
	});

	it("sets ready on success", async () => {
		mock.module("pipertts", () => ({
			PiperTTS: {
				create: async () => ({
					synthesize: async () => ({ audio: Buffer.from("test") }),
				}),
			},
		}));
		const { initTTS, isTTSReady } = await import("../../src/tts/piper.js");
		await initTTS();
		expect(isTTSReady()).toBeTrue();
	});
});

describe("synthesize", () => {
	it("calls piper.synthesize", async () => {
		mock.module("pipertts", () => ({
			PiperTTS: {
				create: async () => ({
					synthesize: async (text: string) => ({ audio: Buffer.from(text) }),
				}),
			},
		}));
		const { initTTS, synthesize } = await import("../../src/tts/piper.js");
		await initTTS();
		const result = await synthesize("hello");
		expect(result.audio).toBeDefined();
	});
});
