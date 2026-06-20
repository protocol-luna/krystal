import { cooldownSeconds } from "../config.js";

const channelCooldowns = new Map<string, number>();
const botActivity = new Map<string, number>();
const lastSpeaker = new Map<string, string>();
const responseCount = new Map<string, number>();

export const MAX_FOLLOWUPS = 3;
export const FOLLOWUP_WINDOW = 60_000;

let paused = false;

export function isPaused(): boolean {
	return paused;
}

export function setPaused(v: boolean): void {
	paused = v;
}

export function isOnCooldown(channelId: string): boolean {
	const last = channelCooldowns.get(channelId);
	if (!last) {
		return false;
	}
	return Date.now() - last < cooldownSeconds * 1000;
}

export function markReplied(channelId: string): void {
	const now = Date.now();
	channelCooldowns.set(channelId, now);
	botActivity.set(channelId, now);
	const count = responseCount.get(channelId) ?? 0;
	responseCount.set(channelId, count + 1);
	setTimeout(() => {
		const c = responseCount.get(channelId) ?? 1;
		responseCount.set(channelId, Math.max(0, c - 1));
	}, FOLLOWUP_WINDOW);
}

export function markBotActivity(channelId: string): void {
	botActivity.set(channelId, Date.now());
}

export function isRecentBotActivity(
	channelId: string,
	windowMs = 15000
): boolean {
	const last = botActivity.get(channelId);
	if (!last) {
		return false;
	}
	return Date.now() - last < windowMs;
}

export function trackSpeaker(
	channelId: string,
	authorId: string
): string | undefined {
	const previous = lastSpeaker.get(channelId);
	lastSpeaker.set(channelId, authorId);
	return previous;
}

export function canFollowUp(channelId: string, botId: string): boolean {
	const recent = isRecentBotActivity(channelId);
	const speaker = lastSpeaker.get(channelId);
	const count = responseCount.get(channelId) ?? 0;
	const ok = recent && speaker === botId && count < MAX_FOLLOWUPS;
	console.log(
		`[state] canFollowUp=${ok} (recentBot=${recent} lastSpeaker=${speaker === botId ? "bot" : (speaker?.slice(0, 6) ?? "?")} followCount=${count})`
	);
	return ok;
}

export function isInConversation(channelId: string, botId: string): boolean {
	return isRecentBotActivity(channelId) && lastSpeaker.get(channelId) === botId;
}

export function clearCooldown(channelId: string): void {
	channelCooldowns.delete(channelId);
	botActivity.delete(channelId);
	responseCount.delete(channelId);
	lastSpeaker.delete(channelId);
}

export function dumpState() {
	return {
		channelCooldowns: [...channelCooldowns.entries()],
		botActivity: [...botActivity.entries()],
		lastSpeaker: [...lastSpeaker.entries()],
		responseCount: [...responseCount.entries()],
		paused,
	};
}

export function restoreState(data: ReturnType<typeof dumpState>): void {
	for (const [k, v] of data.channelCooldowns) {
		channelCooldowns.set(k, v);
	}
	for (const [k, v] of data.botActivity) {
		botActivity.set(k, v);
	}
	for (const [k, v] of data.lastSpeaker) {
		lastSpeaker.set(k, v);
	}
	for (const [k, v] of data.responseCount) {
		responseCount.set(k, v);
	}
	paused = data.paused;
}
