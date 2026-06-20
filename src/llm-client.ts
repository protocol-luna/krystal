interface UserMessage {
	username: string;
	text: string;
}

interface LLMCallbacks {
	onFirstToken?: () => void;
	onChunk: (chunk: string) => void;
}

import { LLM_PORT } from "./config.js";

const BASE = `http://localhost:${LLM_PORT}`;

export async function askLLM(
	userMessage: UserMessage,
	callbacks: LLMCallbacks
): Promise<string> {
	const response = await fetch(`${BASE}/ask`, {
		method: "POST",
		body: JSON.stringify(userMessage),
		headers: { "Content-Type": "application/json" },
	});

	if (!(response.ok && response.body)) {
		throw new Error(`LLM server error: ${response.status}`);
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let fullText = "";

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
						throw new Error(event.data);
					default:
						break;
				}
			} catch {
				// skip malformed lines
			}
		}
	}

	return fullText;
}

export async function resetLLM(): Promise<void> {
	const response = await fetch(`${BASE}/reset`, { method: "POST" });
	if (!response.ok) {
		console.error("LLM reset failed:", response.status);
	}
}

export async function isLLMBusy(): Promise<boolean> {
	try {
		const response = await fetch(`${BASE}/health`);
		if (!response.ok) {
			return true;
		}
		const data = (await response.json()) as { busy: boolean };
		return data.busy;
	} catch {
		return true;
	}
}
