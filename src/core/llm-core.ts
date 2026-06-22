import { LLM_MODE } from "../config.js";
import { llmBus } from "./llm-bus.js";

export interface UserMessage {
	username: string;
	text: string;
	sessionId?: string;
}

interface QueueItem {
	userMessage: UserMessage;
	resolve: (value: string) => void;
	reject: (reason: unknown) => void;
	onFirstToken?: () => void;
	onChunk?: (chunk: string) => void;
}

const requestQueue: QueueItem[] = [];
let queueHead = 0;
let isProcessing = false;
let currentItem: QueueItem | null = null;
let hasSentFirstToken = false;

const MIN_WORD_DELAY = 20;
const MAX_WORD_DELAY = 80;

let isProcessingWords = false;
const wordEmitQueue: Array<() => void> = [];
let wordQueueSize = 0;
let pendingDoneText: string | null = null;

let currentDoneHandler: ((text: string) => void) | null = null;

function processWordEmitQueue(): void {
	if (isProcessingWords || wordEmitQueue.length === 0) {
		return;
	}
	isProcessingWords = true;
	wordEmitQueue.shift()!();
}

function signalDone(text: string): void {
	if (wordQueueSize === 0) {
		llmBus.emit("done", text);
	} else {
		pendingDoneText = text;
	}
}

function emitWordTokens(chunk: string): void {
	const words = chunk.match(/\S+/g) ?? [];
	if (words.length === 0) {
		return;
	}

	wordQueueSize++;

	wordEmitQueue.push(() => {
		let i = 0;
		const emitNext = () => {
			const word = words[i];
			if (i === 0 && !hasSentFirstToken) {
				hasSentFirstToken = true;
				currentItem?.onFirstToken?.();
			}
			llmBus.emit("token", word);
			i++;

			if (i < words.length) {
				const delay =
					MIN_WORD_DELAY + Math.random() * (MAX_WORD_DELAY - MIN_WORD_DELAY);
				setTimeout(emitNext, delay);
			} else {
				wordQueueSize--;
				llmBus.emit("flush");
				if (wordQueueSize === 0 && pendingDoneText !== null) {
					llmBus.emit("done", pendingDoneText);
					pendingDoneText = null;
				}
				isProcessingWords = false;
				processWordEmitQueue();
			}
		};
		emitNext();
	});

	processWordEmitQueue();
}

async function proxyRequest(item: QueueItem): Promise<void> {
	try {
		const { askLLM: askLLMClient } = await import("./llm-client.js");
		const text = await askLLMClient(item.userMessage, {
			onFirstToken: () => {
				if (!hasSentFirstToken) {
					hasSentFirstToken = true;
					currentItem?.onFirstToken?.();
				}
			},
			onChunk: (chunk: string) => {
				emitWordTokens(chunk);
				currentItem?.onChunk?.(chunk);
			},
		});
		signalDone(text);
	} catch (err) {
		llmBus.emit("error", err as Error);
		throw err;
	}
}

async function onlineRequest(item: QueueItem): Promise<void> {
	try {
		const { askOnline } = await import("./llm-online.js");
		const text = await askOnline(item.userMessage, {
			onFirstToken: () => {
				if (!hasSentFirstToken) {
					hasSentFirstToken = true;
					currentItem?.onFirstToken?.();
				}
			},
			onChunk: (chunk: string) => {
				emitWordTokens(chunk);
				currentItem?.onChunk?.(chunk);
			},
		});
		signalDone(text);
	} catch (err) {
		llmBus.emit("error", err as Error);
		throw err;
	}
}

function processQueue(): void {
	if (isProcessing || queueHead >= requestQueue.length) {
		return;
	}
	isProcessing = true;

	const item = requestQueue[queueHead];
	queueHead++;
	if (queueHead > 100 && queueHead >= requestQueue.length / 2) {
		requestQueue.splice(0, queueHead);
		queueHead = 0;
	}

	currentItem = item;
	hasSentFirstToken = false;
	wordEmitQueue.length = 0;
	isProcessingWords = false;
	wordQueueSize = 0;
	pendingDoneText = null;

	const finish = (text: string) => {
		currentItem = null;
		isProcessing = false;
		item.resolve(text);
		setTimeout(() => processQueue(), 100);
	};

	const fail = (err: unknown) => {
		currentItem = null;
		isProcessing = false;
		item.reject(err);
		setTimeout(() => processQueue(), 100);
	};

	currentDoneHandler = (text: string) => {
		llmBus.off("done", currentDoneHandler!);
		currentDoneHandler = null;
		finish(text);
	};
	llmBus.on("done", currentDoneHandler);

	if (LLM_MODE === "direct") {
		void proxyRequest(item).catch((err) => {
			if (currentDoneHandler) {
				llmBus.off("done", currentDoneHandler);
				currentDoneHandler = null;
			}
			fail(err);
		});
	} else if (LLM_MODE === "online") {
		void onlineRequest(item).catch((err) => {
			if (currentDoneHandler) {
				llmBus.off("done", currentDoneHandler);
				currentDoneHandler = null;
			}
			fail(err);
		});
	} else {
		// should not happen — LLM_MODE validated at config level
		fail(new Error(`Unknown LLM mode: ${LLM_MODE}`));
	}
}

export function askLLM(
	userMessage: UserMessage,
	callbacks?: { onFirstToken?: () => void; onChunk?: (chunk: string) => void }
): Promise<string> {
	return new Promise((resolve, reject) => {
		requestQueue.push({
			userMessage,
			resolve,
			reject,
			onFirstToken: callbacks?.onFirstToken,
			onChunk: callbacks?.onChunk,
		});
		void processQueue();
	});
}

export function isLLMBusy(): boolean {
	return isProcessing || queueHead < requestQueue.length;
}

export async function resetLLM(sessionId?: string): Promise<void> {
	requestQueue.length = 0;
	queueHead = 0;
	isProcessing = false;
	currentItem = null;

	if (currentDoneHandler) {
		llmBus.off("done", currentDoneHandler);
		currentDoneHandler = null;
	}

	llmBus.emit("reset");

	if (LLM_MODE === "online") {
		const { clearConversations } = await import("./llm-online.js");
		if (sessionId) {
			clearConversations(sessionId);
		} else {
			clearConversations();
		}
		return;
	}

	const { resetLLM: resetLLMClient } = await import("./llm-client.js");
	await resetLLMClient(sessionId);
}
