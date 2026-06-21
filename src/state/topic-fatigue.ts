import { config } from "../config.js";

const channelWordLogs = new Map<string, string[]>();

function extractSignificant(text: string): string[] {
	const words = text.toLowerCase().split(/\s+/);
	return words.filter((w) => /^[a-z]{4,}$/.test(w));
}

export function recordMessage(channelId: string, text: string): void {
	if (!config.topicFatigueEnabled) {
		return;
	}
	const words = extractSignificant(text);
	if (words.length === 0) {
		return;
	}
	const log = channelWordLogs.get(channelId) ?? [];
	log.push(...words);
	if (log.length > config.topicFatigueWindow * 10) {
		log.splice(0, log.length - config.topicFatigueWindow * 10);
	}
	channelWordLogs.set(channelId, log);
}

function countFrequency(
	channelId: string
): { topWord: string; count: number } | null {
	const log = channelWordLogs.get(channelId);
	if (!log || log.length === 0) {
		return null;
	}
	const freq = new Map<string, number>();
	for (const w of log) {
		freq.set(w, (freq.get(w) ?? 0) + 1);
	}
	let topWord = "";
	let topCount = 0;
	for (const [w, c] of freq) {
		if (c > topCount) {
			topWord = w;
			topCount = c;
		}
	}
	return { topWord, count: topCount };
}

export function getFatigueMultiplier(channelId: string): number {
	if (!config.topicFatigueEnabled) {
		return 1;
	}
	const freq = countFrequency(channelId);
	if (!freq || freq.count < config.topicFatigueThreshold) {
		return 1;
	}
	const excess = freq.count - config.topicFatigueThreshold + 1;
	return Math.min(config.topicFatigueDelayMultiplier * excess, 5);
}

export function getFatigueIgnoreBonus(channelId: string): number {
	if (!config.topicFatigueEnabled) {
		return 0;
	}
	const freq = countFrequency(channelId);
	if (!freq || freq.count < config.topicFatigueThreshold) {
		return 0;
	}
	return config.topicFatigueIgnoreBonus;
}

export function isChannelFatigued(channelId: string): boolean {
	if (!config.topicFatigueEnabled) {
		return false;
	}
	const freq = countFrequency(channelId);
	return freq !== null && freq.count >= config.topicFatigueThreshold;
}

export function dumpTopicFatigue(): [string, string[]][] {
	return [...channelWordLogs.entries()];
}

export function restoreTopicFatigue(data: [string, string[]][]): void {
	channelWordLogs.clear();
	for (const [k, v] of data) {
		channelWordLogs.set(k, v);
	}
}
