import { spawn, type ChildProcess } from "node:child_process";
import {
	LLAMA_CLI_PATH,
	LLM_HOST,
	LLM_PORT,
	LLM_MODE,
	llamaArgs,
} from "../config.js";
import { llmBus } from "./llm-bus.js";

export interface UserMessage {
	username: string;
	text: string;
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

// --- CLI mode state ---
let initialized = false;
let isModelReady = false;
let stdoutBuffer = "";
let currentUsername = "";
let llama: ChildProcess | undefined;
let shutdownRequested = false;
let restartCount = 0;
const MAX_RESTARTS = 5;
let restartDelay = 1_000;

let currentDoneHandler: ((text: string) => void) | null = null;

const LLM_BASE = `http://${LLM_HOST}:${LLM_PORT}`;

function handleStderr(data: Buffer): void {
	const msg = data.toString();
	if (
		msg.toLowerCase().includes("error") ||
		msg.toLowerCase().includes("failed")
	) {
		process.stderr.write(msg);
	}
}

function handleClose(code: number | null): void {
	if (shutdownRequested) {
		console.log("[llm-core] llama-cli arrêté proprement");
		return;
	}
	console.error(`[llm-core] llama-cli crashé (code=${code}), redémarrage...`);
	llmBus.emit("crash", code);
	scheduleRestart();
}

function handleError(err: Error): void {
	console.error(`[llm-core] erreur spawn: ${err.message}`);
	llmBus.emit("error", err);
	scheduleRestart();
}

function ensureLLM(): void {
	if (initialized) {
		return;
	}
	initialized = true;
	isModelReady = LLM_MODE !== "cli";
	if (LLM_MODE === "cli") {
		spawnLlama();
	}
}

// --- CLI backend ---

function spawnLlama(): void {
	if (LLM_MODE !== "cli") {
		return;
	}

	llama?.removeAllListeners();
	llama?.kill();
	llama = undefined;

	console.log(`[llm-core] spawn: ${LLAMA_CLI_PATH} ${llamaArgs.join(" ")}`);
	llama = spawn(LLAMA_CLI_PATH, llamaArgs);

	isModelReady = false;
	stdoutBuffer = "";
	isProcessing = false;

	llama.stdout!.on("data", handleStdout);
	llama.stderr!.on("data", handleStderr);
	llama.on("close", handleClose);
	llama.on("error", handleError);
}

function scheduleRestart(): void {
	restartCount++;
	if (restartCount > MAX_RESTARTS) {
		console.error(
			`[llm-core] ${MAX_RESTARTS} tentatives de redémarrage échouées, abandon`
		);
		process.exit(1);
	}

	const delay = restartDelay;
	restartDelay = Math.min(restartDelay * 2, 30_000);
	console.log(
		`[llm-core] nouvelle tentative dans ${delay}ms (tentative ${restartCount}/${MAX_RESTARTS})`
	);

	setTimeout(() => {
		spawnLlama();
	}, delay);
}

let lastCleanUsername = "";
let cleanLineRe: RegExp | null = null;
let cleanFullRe: RegExp | null = null;

function buildCleanRegexes(username: string): void {
	if (username === lastCleanUsername && cleanLineRe) {
		return;
	}
	lastCleanUsername = username;
	cleanLineRe = new RegExp(
		`^\\s*(Luna|Luna\\s*Bot|${username})\\s*:\\s*`,
		"i"
	);
	cleanFullRe = new RegExp(
		`^\\s*(Luna|Luna\\s*Bot|${username})\\s*:\\s*`,
		"im"
	);
}

function cleanLine(line: string): string {
	buildCleanRegexes(currentUsername);
	let cleaned = line;
	cleaned = cleaned.replace(/\[\s*Prompt:[\s\S]*?\]/g, "");
	cleaned = cleaned.replace(/\[\s*User:\s*.*?\s*\]/gi, "");
	cleaned = cleaned.replace(cleanLineRe!, "");
	return cleaned.trim();
}

function cleanFullResponse(text: string): string {
	buildCleanRegexes(currentUsername);
	let cleaned = text;
	cleaned = cleaned.replace(/\[\s*Prompt:[\s\S]*?\]/g, "");
	cleaned = cleaned.replace(/\[\s*User:\s*.*?\s*\]/gi, "");
	cleaned = cleaned.replace(cleanFullRe!, "");
	return cleaned.trim();
}

function handleStdout(data: Buffer): void {
	const str = data.toString();

	if (!isModelReady) {
		if (str.includes("> ") || str.includes("Enter no prompt")) {
			isModelReady = true;
			restartCount = 0;
			restartDelay = 1_000;
			llmBus.emit("ready");
			console.log("[llm-core] modèle prêt");
			void processQueue();
		}
		return;
	}

	stdoutBuffer += str;

	const endMatch = stdoutBuffer.match(/\n> $/);
	if (endMatch) {
		const fullText = stdoutBuffer.slice(0, endMatch.index);
		stdoutBuffer = "";
		const cleaned = cleanFullResponse(fullText);
		const lines = cleaned
			.split("\n")
			.map((l) => l.trim())
			.filter(Boolean);
		for (const l of lines) {
			emitWordTokens(l);
			currentItem?.onChunk?.(l);
		}
		signalDone(cleaned);
		return;
	}

	if (stdoutBuffer.trim() === ">") {
		return;
	}

	if (!stdoutBuffer.includes("\n")) {
		return;
	}

	const lines = stdoutBuffer.split("\n");
	stdoutBuffer = lines.pop() ?? "";

	for (const line of lines) {
		const cleaned = cleanLine(line);
		if (cleaned) {
			emitWordTokens(cleaned);
			currentItem?.onChunk?.(cleaned);
		}
	}
}

function cliRequest(item: QueueItem): void {
	currentUsername = item.userMessage.username;
	stdoutBuffer = "";
	llama!.stdin!.write(
		`${item.userMessage.username}: ${item.userMessage.text}\n`
	);
}

// --- Server backend ---

const serverParams = (() => {
	const args = llamaArgs;
	// build param map from llamaArgs-like CLI flags
	const map: Record<string, unknown> = {};
	for (let i = 0; i < args.length; i++) {
		const a = args[i];
		if (a === "-m") {
			map.model = args[++i];
		} else if (a === "--temp") {
			map.temperature = Number(args[++i]);
		} else if (a === "--top-k") {
			map.top_k = Number(args[++i]);
		} else if (a === "--top-p") {
			map.top_p = Number(args[++i]);
		} else if (a === "--min-p") {
			map.min_p = Number(args[++i]);
		} else if (a === "--repeat-penalty") {
			map.repeat_penalty = Number(args[++i]);
		} else if (a === "--repeat-last-n") {
			map.repeat_last_n = Number(args[++i]);
		} else if (a === "--presence-penalty") {
			map.presence_penalty = Number(args[++i]);
		} else if (a === "-c") {
			map.n_ctx = Number(args[++i]);
		}
	}
	return map;
})();

async function serverRequest(item: QueueItem): Promise<void> {
	try {
		const response = await fetch(`${LLM_BASE}/completion`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				prompt: `${item.userMessage.username}: ${item.userMessage.text}`,
				stream: true,
				n_predict: 512,
				...serverParams,
			}),
		});

		if (!(response.ok && response.body)) {
			throw new Error(`llama-server error: ${response.status}`);
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
				if (!line.startsWith("data: ")) {
					continue;
				}
				try {
					const data = JSON.parse(line.slice(6)) as {
						content?: string;
						stop?: boolean;
					};
					const content = data.content ?? "";
					if (content) {
						fullText += content;
						emitWordTokens(content);
						currentItem?.onChunk?.(content);
					}
					if (data.stop) {
						signalDone(fullText);
						return;
					}
				} catch {
					// skip malformed SSE
				}
			}
		}

		// stream ended without stop signal
		signalDone(fullText);
	} catch (err) {
		llmBus.emit("error", err as Error);
		throw err;
	}
}

// --- Proxy backend (HTTP → llm-server.ts) ---

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

// --- Online backend (OpenAI-compatible API) ---

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

// --- Queue processing ---

function processQueue(): void {
	ensureLLM();
	if (isProcessing || queueHead >= requestQueue.length) {
		return;
	}
	if (LLM_MODE === "cli" && !isModelReady) {
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

	if (LLM_MODE === "server") {
		void serverRequest(item).catch((err) => {
			if (currentDoneHandler) {
				llmBus.off("done", currentDoneHandler);
				currentDoneHandler = null;
			}
			fail(err);
		});
	} else if (LLM_MODE === "proxy") {
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
		cliRequest(item);
	}
}

// --- Public API ---

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

export async function resetLLM(): Promise<void> {
	requestQueue.length = 0;
	queueHead = 0;
	isProcessing = false;
	currentItem = null;

	if (currentDoneHandler) {
		llmBus.off("done", currentDoneHandler);
		currentDoneHandler = null;
	}

	llmBus.emit("reset");

	if (LLM_MODE === "server" || LLM_MODE === "online") {
		return;
	}

	if (LLM_MODE === "proxy") {
		const { resetLLM: resetLLMClient } = await import("./llm-client.js");
		await resetLLMClient();
		return;
	}

	stdoutBuffer = "";
	llama!.stdin!.write("/clear\n");
	await new Promise<void>((resolve) => {
		const timeout = setTimeout(resolve, 5_000);
		const listener = (data: Buffer) => {
			const str = data.toString();
			if (str.includes("\n> ") || str.endsWith("> ")) {
				clearTimeout(timeout);
				llama!.stdout!.off("data", listener);
				resolve();
			}
		};
		llama!.stdout!.on("data", listener);
	});
}

export function shutdown(): void {
	if (LLM_MODE !== "cli") {
		return;
	}
	shutdownRequested = true;
	llama?.kill();
}
