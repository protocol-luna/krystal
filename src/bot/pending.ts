import type * as Eris from "eris";
import { buildPending, scheduleSave } from "../state/persistence.js";
import { dumpState } from "../state/state.js";
import { dumpTopicFatigue } from "../state/topic-fatigue.js";

export const processing = new Set<string>();
export const pendingMessages = new Map<
	string,
	{ message: Eris.Message; reason: string }
>();

export function pendingKey(channelId: string, userId: string): string {
	return `${channelId}:${userId}`;
}

export function saveAllState(): void {
	const t = dumpState();
	scheduleSave({
		pendingMessages: buildPending(pendingMessages),
		paused: t.paused,
		channelCooldowns: t.channelCooldowns,
		botActivity: t.botActivity,
		lastSpeaker: t.lastSpeaker,
		responseCount: t.responseCount,
		topicWordLogs: dumpTopicFatigue(),
	});
}

export function hasPending(key: string): boolean {
	return pendingMessages.has(key);
}

export function isProcessing(key: string): boolean {
	return processing.has(key);
}

export function markProcessing(key: string): void {
	processing.add(key);
}

export function doneProcessing(key: string): void {
	processing.delete(key);
}

export function queuePending(
	key: string,
	message: Eris.Message,
	reason: string
): void {
	pendingMessages.set(key, { message, reason });
	saveAllState();
}

export function drainPending(key: string): {
	message: Eris.Message;
	reason: string;
} | null {
	const queued = pendingMessages.get(key);
	if (queued) {
		pendingMessages.delete(key);
		saveAllState();
	}
	return queued ?? null;
}

export function restorePending(
	entries: {
		channelId: string;
		messageId: string;
		userId: string;
		reason: string;
	}[],
	client: Eris.Client
): void {
	for (const entry of entries) {
		const key = pendingKey(entry.channelId, entry.userId);
		if (!processing.has(key)) {
			try {
				const channel = client.getChannel(entry.channelId) as
					| Eris.GuildTextableChannel
					| undefined;
				if (channel) {
					client
						.getMessage(entry.channelId, entry.messageId)
						.then((msg) => {
							pendingMessages.set(key, { message: msg, reason: entry.reason });
						})
						.catch(() => {
							// message deleted or inaccessible
						});
				}
			} catch {
				// channel inaccessible
			}
		}
	}
}
