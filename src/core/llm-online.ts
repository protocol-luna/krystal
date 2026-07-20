import {
	FEW_SHOT_ENABLED,
	FEW_SHOT_EXAMPLES,
	LLM_API_ENDPOINT,
	LLM_API_TOKEN,
	LLM_MODEL,
	SYSTEM_PROMPT,
} from "../config.js";
import {
	formatFewShotExamples,
	injectFewShotIntoConversation,
} from "./few-shot.js";

interface OnlineCallbacks {
	onFirstToken?: () => void;
	onChunk: (chunk: string) => void;
}

interface Message {
	role: "system" | "user" | "assistant";
	content: string;
}

const conversations = new Map<string, Message[]>();
const MAX_HISTORY = 20; // max exchanges (user+assistant pairs)

export async function askOnline(
	userMessage: { username: string; text: string; sessionId?: string },
	callbacks: OnlineCallbacks
): Promise<string> {
	if (!(LLM_API_ENDPOINT && LLM_API_TOKEN)) {
		throw new Error(
			"llm_api_endpoint and llm_api_token required in online mode"
		);
	}

	const sid = userMessage.sessionId ?? "default";
	let history: Message[] | undefined;

	if (sid) {
		history = conversations.get(sid);
		if (!history) {
			history = [{ role: "system", content: SYSTEM_PROMPT }];
			conversations.set(sid, history);
		}
	}

	const messages: Message[] = history ?? [
		{ role: "system", content: SYSTEM_PROMPT },
	];

	messages.push({
		role: "user",
		content: `${userMessage.username}: ${userMessage.text}`,
	});

	let payloadMessages: Message[] = messages;
	if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
		const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
		payloadMessages = injectFewShotIntoConversation(
			messages,
			fewShotMessages
		) as Message[];
	}

	const response = await fetch(LLM_API_ENDPOINT, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${LLM_API_TOKEN}`,
		},
		body: JSON.stringify({
			model: LLM_MODEL,
			messages: payloadMessages,
			stream: true,
			frequency_penalty: 0.3,
			presence_penalty: 0.3,
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
				return finishResponse(fullText, messages, history);
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

	return finishResponse(fullText, messages, history);
}

function finishResponse(
	text: string,
	messages: Message[],
	history: Message[] | undefined
): string {
	messages.push({ role: "assistant", content: text });

	if (history) {
		// trim: keep system prompt + last MAX_HISTORY exchanges
		const system = messages[0];
		const exchanges = messages.slice(1);
		if (exchanges.length > MAX_HISTORY * 2) {
			history.length = 0;
			history.push(system);
			history.push(...exchanges.slice(-MAX_HISTORY * 2));
		}
	}

	return text;
}

export function clearConversations(sessionId?: string): void {
	if (sessionId) {
		conversations.delete(sessionId);
	} else {
		conversations.clear();
	}
}
