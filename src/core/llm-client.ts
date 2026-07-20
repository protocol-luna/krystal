import {
	FEW_SHOT_ENABLED,
	FEW_SHOT_EXAMPLES,
	LLM_HOST,
	LLM_N_SLOTS,
	LLM_PORT,
	LLM_SESSION_TTL,
	MIROSTAT_ENABLED,
	MIROSTAT_ENT,
	MIROSTAT_LR,
	MIROSTAT_MODE,
	SYSTEM_PROMPT,
} from "../config.js";
import {
	formatFewShotExamples,
	injectFewShotIntoConversation,
} from "./few-shot.js";

interface Message {
	role: "system" | "user" | "assistant";
	content: string;
}

const BASE = `http://${LLM_HOST}:${LLM_PORT}`;
const sessions = new Map<string, { messages: Message[]; lastUsed: number }>();

function slotForSession(sessionId: string): number {
	let hash = 0;
	for (let i = 0; i < sessionId.length; i++) {
		hash = ((hash << 5) - hash + sessionId.charCodeAt(i)) | 0;
	}
	return Math.abs(hash) % LLM_N_SLOTS;
}

function cleanupStaleSessions(): void {
	const now = Date.now();
	for (const [sid, session] of sessions) {
		if (now - session.lastUsed > LLM_SESSION_TTL) {
			sessions.delete(sid);
		}
	}
}

async function askLlamaServerOnce(
	messages: Message[],
	slot: number
): Promise<string> {
	// Ajouter le few-shot priming si activé
	let finalMessages = messages;
	if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
		const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
		finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
	}

	const samplingParams = MIROSTAT_ENABLED
		? {
				mirostat: MIROSTAT_MODE,
				mirostat_lr: MIROSTAT_LR,
				mirostat_ent: MIROSTAT_ENT,
				repeat_penalty: 1.15,
				repeat_last_n: 64,
			}
		: {
				temperature: 0.8,
				top_k: 60,
				top_p: 0.9,
				min_p: 0.05,
				repeat_penalty: 1.15,
				repeat_last_n: 64,
			};

	const body = JSON.stringify({
		messages: finalMessages,
		id_slot: slot,
		cache_prompt: true,
		max_tokens: 2000,
		...samplingParams,
	});

	const resp = await fetch(`${BASE}/v1/chat/completions`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body,
	});

	if (!resp.ok) {
		const errText = await resp.text();
		throw new Error(
			`llama-server error ${resp.status}: ${errText.slice(0, 200)}`
		);
	}

	const data = (await resp.json()) as {
		choices: { message: { content: string } }[];
	};
	return data.choices?.[0]?.message?.content ?? "";
}

function isDegenerateOutput(text: string): boolean {
	const trimmed = text.trim();
	if (trimmed.length === 0) {
		return true;
	}
	if (trimmed.length < 2) {
		return true;
	}
	if (!/\s/.test(trimmed) && trimmed.length < 15 && !/[.!?]$/.test(trimmed)) {
		return true;
	}
	return false;
}

const MAX_RETRIES = 2;

async function askLlamaServer(
	messages: Message[],
	slot: number
): Promise<string> {
	let lastResponse = "";
	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		lastResponse = await askLlamaServerOnce(messages, slot);
		if (!isDegenerateOutput(lastResponse)) {
			return lastResponse;
		}
		console.warn(
			`[llm-client] sortie dégénérée détectée (tentative ${attempt + 1}/${MAX_RETRIES + 1}): "${lastResponse}"`
		);
	}
	return lastResponse;
}

export async function askLLM(
	userMessage: { username: string; text: string; sessionId?: string },
	callbacks: { onFirstToken?: () => void; onChunk: (chunk: string) => void }
): Promise<string> {
	const sid = userMessage.sessionId ?? "default";

	let session = sessions.get(sid);
	if (!session) {
		session = {
			messages: [{ role: "system", content: SYSTEM_PROMPT }],
			lastUsed: Date.now(),
		};
		sessions.set(sid, session);
	}
	session.lastUsed = Date.now();

	const userMsg = userMessage.username
		? `${userMessage.username}: ${userMessage.text}`
		: userMessage.text;
	session.messages.push({ role: "user", content: userMsg });

	cleanupStaleSessions();

	const slot = slotForSession(sid);
	const response = await askLlamaServer(session.messages, slot);

	session.messages.push({ role: "assistant", content: response });

	callbacks.onFirstToken?.();
	callbacks.onChunk(response);

	return response;
}

export function resetLLM(sessionId?: string): void {
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
