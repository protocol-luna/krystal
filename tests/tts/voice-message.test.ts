import { describe, it, expect, } from "bun:test";
import { mockConfig } from "../_mock-config.js";

describe("shouldSendVoice", () => {
	it("returns false when voiceMessageChance is 0", async () => {
		mockConfig({ voiceMessageChance: 0 });
		const { shouldSendVoice } = await import("../../src/tts/voice-message.js");
		expect(shouldSendVoice()).toBeFalse();
	});

	it("returns false when voiceMessageChance is negative", async () => {
		mockConfig({ voiceMessageChance: -0.1 });
		const { shouldSendVoice } = await import("../../src/tts/voice-message.js");
		expect(shouldSendVoice()).toBeFalse();
	});

	it("returns true when chance is 1", async () => {
		mockConfig({ voiceMessageChance: 1 });
		const { shouldSendVoice } = await import("../../src/tts/voice-message.js");
		expect(shouldSendVoice()).toBeTrue();
	});

	it("statistically respects the chance", async () => {
		mockConfig({ voiceMessageChance: 0.5 });
		const { shouldSendVoice } = await import("../../src/tts/voice-message.js");
		let sends = 0;
		const trials = 200;
		for (let i = 0; i < trials; i++) {
			if (shouldSendVoice()) { sends++; }
		}
		expect(sends).toBeGreaterThan(0);
	});
});
