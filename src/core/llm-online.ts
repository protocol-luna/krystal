import {
	SYSTEM_PROMPT,
	LLM_API_ENDPOINT,
	LLM_API_TOKEN,
	LLM_MODEL,
} from "../config.js";

interface OnlineCallbacks {
	onFirstToken?: () => void;
	onChunk: (chunk: string) => void;
}

export async function askOnline(
	userMessage: { username: string; text: string },
	callbacks: OnlineCallbacks
): Promise<string> {
	if (!(LLM_API_ENDPOINT && LLM_API_TOKEN)) {
		throw new Error(
			"llm_api_endpoint and llm_api_token required in online mode"
		);
	}

	const response = await fetch(LLM_API_ENDPOINT, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${LLM_API_TOKEN}`,
		},
		body: JSON.stringify({
			model: LLM_MODEL,
			messages: [
				{ role: "system", content: SYSTEM_PROMPT },
				{
					role: "user",
					content: `${userMessage.username}: ${userMessage.text}`,
				},
			],
			stream: true,
		}),
	});

	if (!(response.ok && response.body)) {
		const text = await response.text().catch(() => "");
		throw new Error(
			`OpenAI API error: ${response.status} ${response.statusText}${text ? ` -- ${text}` : ""}`
		);
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let fullText = "";
	let isFirst = true;

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed.startsWith("data: ")) {
				continue;
			}
			const payload = trimmed.slice(6);
			if (payload === "[DONE]") {
				return fullText;
			}
			try {
				const data = JSON.parse(payload) as {
					choices?: Array<{ delta: { content?: string } }>;
				};
				const content = data.choices?.[0]?.delta?.content ?? "";
				if (content) {
					fullText += content;
					if (isFirst) {
						isFirst = false;
						callbacks.onFirstToken?.();
					}
					callbacks.onChunk(content);
				}
			} catch {
				// skip malformed JSON
			}
		}
	}

	return fullText;
}
