import * as fs from "node:fs/promises";
import * as path from "node:path";

const STATE_FILE = path.resolve("state.json");

export interface PendingEntry {
	channelId: string;
	messageId: string;
	userId: string;
	reason: string;
	timestamp: number;
}

export interface PersistedState {
	pendingMessages: PendingEntry[];
	paused: boolean;
	channelCooldowns: [string, number][];
	botActivity: [string, number][];
	lastSpeaker: [string, string][];
	responseCount: [string, number][];
}

function defaultState(): PersistedState {
	return {
		pendingMessages: [],
		paused: false,
		channelCooldowns: [],
		botActivity: [],
		lastSpeaker: [],
		responseCount: [],
	};
}

export async function loadState(): Promise<PersistedState> {
	try {
		const raw = await fs.readFile(STATE_FILE, "utf-8");
		const parsed = JSON.parse(raw) as PersistedState;
		if (typeof parsed.paused !== "boolean") {
			throw new Error("invalid paused");
		}
		console.log(
			`[persist] loaded state: ${parsed.pendingMessages.length} pending, paused=${parsed.paused}`,
		);
		return parsed;
	} catch {
		return defaultState();
	}
}

export async function persistState(state: PersistedState): Promise<void> {
	await fs.writeFile(STATE_FILE, JSON.stringify(state), "utf-8");
	console.log(
		`[persist] saved state: ${state.pendingMessages.length} pending, paused=${state.paused}`,
	);
}

export function buildPending(
	pending: Map<
		string,
		{ message: import("eris").Message; reason: string }
	>,
): PendingEntry[] {
	const out: PendingEntry[] = [];
	for (const [, { message, reason }] of pending) {
		out.push({
			channelId: message.channel.id,
			messageId: message.id,
			userId: message.author.id,
			reason,
			timestamp: Date.now(),
		});
	}
	return out;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: PersistedState | null = null;

export function scheduleSave(state: PersistedState): void {
	pendingState = state;
	if (saveTimer) {
		clearTimeout(saveTimer);
	}
	saveTimer = setTimeout(() => {
		if (pendingState) {
			persistState(pendingState).catch((err) => {
				console.error("[persist] async write failed:", err);
			});
		}
		saveTimer = null;
	}, 500);
}
