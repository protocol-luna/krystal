import { describe, it, expect } from "bun:test";

describe("sanitizeForTTS", () => {
	it("removes user mentions", async () => {
		const { sanitizeForTTS } = await import("../../src/tts/audio.js");
		const result = sanitizeForTTS("hello <@12345> world");
		expect(result).toContain("@utilisateur");
		expect(result).not.toContain("<@12345>");
	});

	it("removes role mentions", async () => {
		const { sanitizeForTTS } = await import("../../src/tts/audio.js");
		const result = sanitizeForTTS("<@&12345>");
		expect(result).toContain("@utilisateur");
	});

	it("removes channel mentions", async () => {
		const { sanitizeForTTS } = await import("../../src/tts/audio.js");
		const result = sanitizeForTTS("in <#12345> channel");
		expect(result).not.toContain("<#12345>");
	});

	it("removes custom emojis", async () => {
		const { sanitizeForTTS } = await import("../../src/tts/audio.js");
		const result = sanitizeForTTS("that's <:blobcat:12345> so <a:cool:67890>");
		expect(result).not.toContain("blobcat");
		expect(result).not.toContain("cool");
	});

	it("removes URLs", async () => {
		const { sanitizeForTTS } = await import("../../src/tts/audio.js");
		const result = sanitizeForTTS(
			"check https://example.com/foo?bar=1 for info"
		);
		expect(result).not.toContain("https://");
	});

	it("truncates at 500 chars", async () => {
		const { sanitizeForTTS } = await import("../../src/tts/audio.js");
		const long = "a".repeat(1000);
		const result = sanitizeForTTS(long);
		expect(result.length).toBeLessThanOrEqual(500);
	});

	it("returns placeholder for empty text", async () => {
		const { sanitizeForTTS } = await import("../../src/tts/audio.js");
		const result = sanitizeForTTS("");
		expect(result).toBe("...");
	});

	it("returns placeholder for whitespace-only text", async () => {
		const { sanitizeForTTS } = await import("../../src/tts/audio.js");
		const result = sanitizeForTTS("   ");
		expect(result).toBe("...");
	});

	it("preserves normal text", async () => {
		const { sanitizeForTTS } = await import("../../src/tts/audio.js");
		const result = sanitizeForTTS("Hello, how are you?");
		expect(result).toBe("Hello how are you");
	});
});

describe("buildWaveformBase64", () => {
	it("returns a base64 string", async () => {
		const { buildWaveformBase64 } = await import("../../src/tts/audio.js");
		const result = buildWaveformBase64(256);
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});

	it("uses default 256 points", async () => {
		const { buildWaveformBase64 } = await import("../../src/tts/audio.js");
		const result = buildWaveformBase64();
		expect(result.length).toBeGreaterThan(0);
	});

	it("produces different output for different point counts", async () => {
		const { buildWaveformBase64 } = await import("../../src/tts/audio.js");
		const small = buildWaveformBase64(64);
		const large = buildWaveformBase64(512);
		expect(small.length).toBeLessThan(large.length);
	});
});

describe("hasUnsafeTTSText", () => {
	it("returns true for emoji in range U+1F000-1FFFF", async () => {
		const { hasUnsafeTTSText } = await import("../../src/tts/audio.js");
		expect(hasUnsafeTTSText("hello 😀 world")).toBeTrue();
	});

	it("returns true for emoji in range U+2600-26FF", async () => {
		const { hasUnsafeTTSText } = await import("../../src/tts/audio.js");
		expect(hasUnsafeTTSText("☀️ sunny")).toBeTrue();
	});

	it("returns true for emoji in range U+2700-27BF", async () => {
		const { hasUnsafeTTSText } = await import("../../src/tts/audio.js");
		expect(hasUnsafeTTSText("✈️ travel")).toBeTrue();
	});

	it("returns false for plain text", async () => {
		const { hasUnsafeTTSText } = await import("../../src/tts/audio.js");
		expect(hasUnsafeTTSText("Hello, how are you?")).toBeFalse();
	});

	it("returns false for numbers and punctuation", async () => {
		const { hasUnsafeTTSText } = await import("../../src/tts/audio.js");
		expect(hasUnsafeTTSText("42! test? no.")).toBeFalse();
	});
});
