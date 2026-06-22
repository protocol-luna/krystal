import { LLM_HOST, LLM_PORT, LLM_SERVER_KEY } from "../config.js";

const BASE = `http://${LLM_HOST}:${LLM_PORT}`;

function authHeaders(): Record<string, string> {
	return LLM_SERVER_KEY
		? { Authorization: `Bearer ${LLM_SERVER_KEY}`, "Content-Type": "application/json" }
		: { "Content-Type": "application/json" };
}

export async function askLLM(
	userMessage: { username: string; text: string; sessionId?: string },
	callbacks: { onFirstToken?: () => void; onChunk: (chunk: string) => void }
): Promise<string> {
	const response = await fetch(`${BASE}/ask`, {
		method: "POST",
		body: JSON.stringify(userMessage),
		headers: authHeaders(),
	});

	if (!(response.ok && response.body)) {
		throw new Error(`LLM server error: ${response.status}`);
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let fullText = "";
	let llmError: Error | null = null;

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";

		for (const line of lines) {
			if (!line.trim()) {
				continue;
			}
			try {
				const event = JSON.parse(line);
				switch (event.type) {
					case "firstToken":
						callbacks.onFirstToken?.();
						break;
					case "chunk":
						callbacks.onChunk(event.data);
						break;
					case "done":
						fullText = event.data;
						break;
					case "error":
						llmError = new Error(event.data);
						break;
					default:
						break;
				}
			} catch {
				// skip malformed JSON lines
			}
		}
	}

	if (llmError) {
		throw llmError;
	}
	return fullText;
}

export async function resetLLM(sessionId?: string): Promise<void> {
	const url = sessionId
		? `${BASE}/reset?sessionId=${encodeURIComponent(sessionId)}`
		: `${BASE}/reset`;
	const response = await fetch(url, {
		method: "POST",
		headers: authHeaders(),
	});
	if (!response.ok) {
		console.error("LLM reset failed:", response.status);
	}
}

export async function isLLMBusy(): Promise<boolean> {
	try {
		const response = await fetch(`${BASE}/health`, { headers: authHeaders() });
		if (!response.ok) {
			return true;
		}
		const data = (await response.json()) as { busy: boolean };
		return data.busy;
	} catch {
		return true;
	}
}
