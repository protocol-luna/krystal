import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { applyTypo } from "./typo.js";

describe("applyTypo", () => {
	let originalRandom: typeof Math.random;

	beforeEach(() => {
		originalRandom = Math.random;
	});

	afterEach(() => {
		Math.random = originalRandom;
	});

	it("returns null for empty string", () => {
		expect(applyTypo("", "azerty")).toBeNull();
		expect(applyTypo("", "qwerty")).toBeNull();
	});

	it("returns null for text with no letters", () => {
		expect(applyTypo("123!@#", "azerty")).toBeNull();
		expect(applyTypo("   ", "qwerty")).toBeNull();
	});

	it("replaces a random letter with an adjacent AZERTY key", () => {
		Math.random = mock(() => 0);
		const result = applyTypo("bonjour", "azerty");
		expect(result).not.toBeNull();
		expect(result!.original).toBe("bonjour");
		expect(result!.charIndex).toBeGreaterThanOrEqual(0);
		expect(result!.charIndex).toBeLessThan("bonjour".length);
		expect(result!.originalChar).toMatch(/[a-z]/);
		expect(result!.typoChar).toMatch(/[a-z]/);
		expect(result!.typoChar).not.toBe(result!.originalChar);
		expect(result!.text.length).toBe("bonjour".length);
	});

	it("replaces a random letter with an adjacent QWERTY key", () => {
		Math.random = mock(() => 0);
		const result = applyTypo("hello", "qwerty");
		expect(result).not.toBeNull();
		expect(result!.original).toBe("hello");
		expect(result!.text.length).toBe("hello".length);
	});

	it("preserves original casing", () => {
		Math.random = mock(() => 0);
		const result = applyTypo("Bonjour", "azerty");
		expect(result).not.toBeNull();
		const diffIdx = result!.charIndex;
		const origIsUpper = "Bonjour"[diffIdx] === "Bonjour"[diffIdx].toUpperCase();
		const newIsUpper = result!.text[diffIdx] === result!.text[diffIdx].toUpperCase();
		expect(origIsUpper).toBe(newIsUpper);
	});

	it("extracts correct word boundaries", () => {
		Math.random = mock(() => 0.5);
		const result = applyTypo("hello world", "qwerty");
		expect(result).not.toBeNull();
		expect(result!.originalWord.length).toBeGreaterThan(0);
		expect(result!.correctedWord.length).toBe(result!.originalWord.length);
		expect(result!.original).toBe("hello world");
	});

	it("handles multi-word strings", () => {
		Math.random = mock(() => 0.3);
		const result = applyTypo("the quick brown fox", "azerty");
		expect(result).not.toBeNull();
		expect(result!.originalWord.length).toBeGreaterThan(0);
		expect(result!.correctedWord.length).toBe(result!.originalWord.length);
	});

	it("differs from original by exactly one character", () => {
		Math.random = mock(() => 0.7);
		const result = applyTypo("testing", "azerty");
		expect(result).not.toBeNull();
		let diffs = 0;
		for (let i = 0; i < result!.text.length; i++) {
			if (result!.text[i] !== result!.original[i]) diffs++;
		}
		expect(diffs).toBe(1);
	});
});
