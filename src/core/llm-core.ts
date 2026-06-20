import { spawn, type ChildProcess } from "node:child_process";
import { LLAMA_CLI_PATH, llamaArgs } from "../config.js";
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
let isModelReady = false;
let stdoutBuffer = "";
let currentUsername = "";
let currentItem: QueueItem | null = null;
let hasSentFirstToken = false;

let llama: ChildProcess;
let shutdownRequested = false;
let restartCount = 0;
const MAX_RESTARTS = 5;
let restartDelay = 1_000;

function spawnLlama(): void {
	console.log(`[llm-core] spawn: ${LLAMA_CLI_PATH} ${llamaArgs.join(" ")}`);
	llama = spawn(LLAMA_CLI_PATH, llamaArgs);

	isModelReady = false;
	stdoutBuffer = "";
	isProcessing = false;

	llama.stdout!.on("data", handleStdout);

	llama.stderr!.on("data", (data: Buffer) => {
		const msg = data.toString();
		if (
			msg.toLowerCase().includes("error") ||
			msg.toLowerCase().includes("failed")
		) {
			process.stderr.write(msg);
		}
	});

	llama.on("close", (code: number | null) => {
		if (shutdownRequested) {
			console.log("[llm-core] llama-cli arrêté proprement");
			return;
		}
		console.error(`[llm-core] llama-cli crashé (code=${code}), redémarrage...`);
		llmBus.emit("crash", code);
		scheduleRestart();
	});

	llama.on("error", (err: Error) => {
		console.error(`[llm-core] erreur spawn: ${err.message}`);
		llmBus.emit("error", err);
		scheduleRestart();
	});
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

function cleanLine(line: string): string {
	let cleaned = line;
	cleaned = cleaned.replace(/\[\s*Prompt:[\s\S]*?\]/g, "");
	cleaned = cleaned.replace(/\[\s*User:\s*.*?\s*\]/gi, "");
	cleaned = cleaned.replace(
		new RegExp(`^\\s*(Luna|Luna\\s*Bot|${currentUsername})\\s*:\\s*`, "i"),
		""
	);
	return cleaned.trim();
}

function cleanFullResponse(text: string): string {
	let cleaned = text;
	cleaned = cleaned.replace(/\[\s*Prompt:[\s\S]*?\]/g, "");
	cleaned = cleaned.replace(/\[\s*User:\s*.*?\s*\]/gi, "");
	cleaned = cleaned.replace(
		new RegExp(`^\\s*(Luna|Luna\\s*Bot|${currentUsername})\\s*:\\s*`, "im"),
		""
	);
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
			if (!hasSentFirstToken) {
				hasSentFirstToken = true;
				currentItem?.onFirstToken?.();
			}
			llmBus.emit("token", l);
			currentItem?.onChunk?.(l);
		}
		llmBus.emit("done", cleaned);
		return;
	}

	if (stdoutBuffer.trim() === ">") {
		return;
	}

	const lastNewline = stdoutBuffer.lastIndexOf("\n");
	if (lastNewline === -1) {
		return;
	}

	const chunk = stdoutBuffer.slice(0, lastNewline);
	stdoutBuffer = stdoutBuffer.slice(lastNewline + 1);

	const cleaned = cleanLine(chunk);
	if (cleaned) {
		if (!hasSentFirstToken) {
			hasSentFirstToken = true;
			currentItem?.onFirstToken?.();
		}
		llmBus.emit("token", cleaned);
		currentItem?.onChunk?.(cleaned);
	}
}

function processQueue(): void {
	if (isProcessing || queueHead >= requestQueue.length || !isModelReady) {
		return;
	}
	isProcessing = true;

	const item = requestQueue[queueHead];
	queueHead++;
	if (queueHead > 100 && queueHead >= requestQueue.length / 2) {
		requestQueue.splice(0, queueHead);
		queueHead = 0;
	}

	const { userMessage, resolve } = item;
	stdoutBuffer = "";
	currentUsername = userMessage.username;
	currentItem = item;
	hasSentFirstToken = false;

	const doneHandler = (text: string) => {
		llmBus.off("done", doneHandler);
		currentItem = null;
		isProcessing = false;
		resolve(text);
		setTimeout(() => processQueue(), 100);
	};
	llmBus.on("done", doneHandler);

	llama.stdin!.write(`${userMessage.username}: ${userMessage.text}\n`);
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

export async function resetLLM(): Promise<void> {
	requestQueue.length = 0;
	queueHead = 0;
	isProcessing = false;
	stdoutBuffer = "";
	llmBus.emit("reset");
	llama.stdin!.write("/clear\n");
	await new Promise<void>((resolve) => {
		const timeout = setTimeout(resolve, 5_000);
		const listener = (data: Buffer) => {
			const str = data.toString();
			if (str.includes("\n> ") || str.endsWith("> ")) {
				clearTimeout(timeout);
				llama.stdout!.off("data", listener);
				resolve();
			}
		};
		llama.stdout!.on("data", listener);
	});
}

export function shutdown(): void {
	shutdownRequested = true;
	llama?.kill();
}

spawnLlama();
