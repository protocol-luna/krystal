import { cooldownSeconds } from "../config.js";
import { stateBus } from "./state-bus.js";

const channelCooldowns = new Map<string, number>();
const botActivity = new Map<string, number>();
const lastSpeaker = new Map<string, { userId: string; timestamp: number }>();
const responseCount = new Map<string, number>();

export const MAX_FOLLOWUPS = 3;
export const FOLLOWUP_WINDOW = 60_000;
const PRUNE_INTERVAL = 5 * 60_000;
const PRUNE_CUTOFF = 3_600_000;

let paused = false;

export function isPaused(): boolean {
	return paused;
}

export function setPaused(v: boolean): void {
	paused = v;
	stateBus.emit("state:changed");
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
	stateBus.emit("state:changed");
}

export function markBotActivity(channelId: string): void {
	botActivity.set(channelId, Date.now());
	stateBus.emit("state:changed");
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
	lastSpeaker.set(channelId, { userId: authorId, timestamp: Date.now() });
	stateBus.emit("state:changed");
	return previous?.userId;
}

export function canFollowUp(channelId: string, botId: string): boolean {
	const recent = isRecentBotActivity(channelId);
	const speaker = lastSpeaker.get(channelId);
	const count = responseCount.get(channelId) ?? 0;
	const ok = recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
	console.log(
		`[state] canFollowUp=${ok} (recentBot=${recent} lastSpeaker=${speaker?.userId === botId ? "bot" : (speaker?.userId?.slice(0, 6) ?? "?")} followCount=${count})`
	);
	return ok;
}

export function isInConversation(channelId: string, botId: string): boolean {
	return (
		isRecentBotActivity(channelId) &&
		lastSpeaker.get(channelId)?.userId === botId
	);
}

export function clearCooldown(channelId: string): void {
	channelCooldowns.delete(channelId);
	botActivity.delete(channelId);
	responseCount.delete(channelId);
	lastSpeaker.delete(channelId);
	stateBus.emit("state:changed");
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

export function startPruning(): void {
	setInterval(() => {
		const now = Date.now();
		const cutoff = now - PRUNE_CUTOFF;

		for (const [key, ts] of channelCooldowns) {
			if (ts < cutoff) {
				channelCooldowns.delete(key);
			}
		}
		for (const [key, ts] of botActivity) {
			if (ts < cutoff) {
				botActivity.delete(key);
			}
		}
		for (const [key, entry] of lastSpeaker) {
			if (entry.timestamp < cutoff) {
				lastSpeaker.delete(key);
			}
		}
		for (const [key, count] of responseCount) {
			if (count <= 0) {
				responseCount.delete(key);
			}
		}
	}, PRUNE_INTERVAL);
}
