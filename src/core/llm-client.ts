import { LLM_HOST, LLM_PORT, SYSTEM_PROMPT, LLM_SESSION_TTL } from "../config.js";

interface Message {
	role: "system" | "user" | "assistant";
	content: string;
}

const SLOTS = 4;
const BASE = `http://${LLM_HOST}:${LLM_PORT}`;
const sessions = new Map<string, { messages: Message[]; lastUsed: number }>();

function slotForSession(sessionId: string): number {
	let hash = 0;
	for (let i = 0; i < sessionId.length; i++) {
		hash = ((hash << 5) - hash + sessionId.charCodeAt(i)) | 0;
	}
	return Math.abs(hash) % SLOTS;
}

function cleanupStaleSessions(): void {
	const now = Date.now();
	for (const [sid, session] of sessions) {
		if (now - session.lastUsed > LLM_SESSION_TTL) {
			sessions.delete(sid);
		}
	}
}

async function askLlamaServer(messages: Message[], slot: number): Promise<string> {
	const body = JSON.stringify({
		messages,
		id_slot: slot,
		cache_prompt: true,
		temperature: 0.8,
		top_k: 40,
		top_p: 0.95,
		min_p: 0.05,
		max_tokens: 2000,
	});

	const resp = await fetch(`${BASE}/v1/chat/completions`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body,
	});

	if (!resp.ok) {
		const errText = await resp.text();
		throw new Error(`llama-server error ${resp.status}: ${errText.slice(0, 200)}`);
	}

	const data = (await resp.json()) as {
		choices: { message: { content: string } }[];
	};
	return data.choices?.[0]?.message?.content ?? "";
}

export async function askLLM(
	userMessage: { username: string; text: string; sessionId?: string },
	callbacks: { onFirstToken?: () => void; onChunk: (chunk: string) => void }
): Promise<string> {
	const sid = userMessage.sessionId ?? "default";

	let session = sessions.get(sid);
	if (!session) {
		session = { messages: [{ role: "system", content: SYSTEM_PROMPT }], lastUsed: Date.now() };
		sessions.set(sid, session);
	}
	session.lastUsed = Date.now();

	const userMsg = userMessage.username ? `${userMessage.username}: ${userMessage.text}` : userMessage.text;
	session.messages.push({ role: "user", content: userMsg });

	cleanupStaleSessions();

	const slot = slotForSession(sid);
	const response = await askLlamaServer(session.messages, slot);

	session.messages.push({ role: "assistant", content: response });

	callbacks.onFirstToken?.();
	callbacks.onChunk(response);

	return response;
}

export async function resetLLM(sessionId?: string): Promise<void> {
	if (sessionId) {
		sessions.delete(sessionId);
	} else {
		sessions.clear();
	}
}

export async function isLLMBusy(): Promise<boolean> {
	try {
		const resp = await fetch(`${BASE}/health`);
		return !resp.ok;
	} catch {
		return true;
	}
}
