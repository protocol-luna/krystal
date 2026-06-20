import { spawn, type ChildProcess } from "node:child_process";
import { LLAMA_CLI_PATH, llamaArgs } from "../config.js";

export interface UserMessage {
	username: string;
	text: string;
}

export interface LLMCallbacks {
	onFirstToken?: () => void;
	onChunk: (chunk: string) => void;
}

interface QueueItem {
	userMessage: UserMessage;
	callbacks: LLMCallbacks;
	resolve: (value: string) => void;
	reject: (reason: unknown) => void;
}

const requestQueue: QueueItem[] = [];
let queueHead = 0;
let isProcessing = false;
let currentOnChunk: ((chunk: string) => void) | null = null;
let currentOnDone: ((text: string) => void) | null = null;
let currentOnFirstToken: (() => void) | null = null;
let isModelReady = false;
let stdoutBuffer = "";
let currentUsername = "";

let llama: ChildProcess;
let shutdownRequested = false;
let restartCount = 0;
const MAX_RESTARTS = 5;
let restartDelay = 1_000; // doubles each attempt

function spawnLlama(): void {
	console.log(`[llm-core] spawn: ${LLAMA_CLI_PATH} ${llamaArgs.join(" ")}`);
	llama = spawn(LLAMA_CLI_PATH, llamaArgs);

	isModelReady = false;
	stdoutBuffer = "";

	currentOnFirstToken = null;
	currentOnChunk = null;
	currentOnDone = null;
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
		scheduleRestart();
	});

	llama.on("error", (err: Error) => {
		console.error(`[llm-core] erreur spawn: ${err.message}`);
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
			console.log("[llm-core] modèle prêt");
			void processQueue();
		}
		return;
	}

	stdoutBuffer += str;

	if (!(currentOnChunk || currentOnDone)) {
		return;
	}

	if (currentOnFirstToken) {
		currentOnFirstToken();
		currentOnFirstToken = null;
	}

	const endMatch = stdoutBuffer.match(/\n> $/);
	if (endMatch) {
		const fullText = stdoutBuffer.slice(0, endMatch.index);
		stdoutBuffer = "";
		const cleaned = cleanFullResponse(fullText);
		for (const line of cleaned.split("\n")) {
			const l = line.trim();
			if (l) {
				currentOnChunk?.(l);
			}
		}
		if (currentOnDone) {
			currentOnDone(cleaned);
		}
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
		currentOnChunk?.(cleaned);
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

	const { userMessage, callbacks, resolve } = item;
	stdoutBuffer = "";
	currentUsername = userMessage.username;

	currentOnFirstToken = callbacks.onFirstToken ?? null;
	currentOnChunk = callbacks.onChunk;
	currentOnDone = (text: string) => {
		currentOnChunk = null;
		currentOnDone = null;
		resolve(text);
		isProcessing = false;
		setTimeout(() => processQueue(), 100);
	};

	llama.stdin!.write(`${userMessage.username}: ${userMessage.text}\n`);
}

export function askLLM(
	userMessage: UserMessage,
	callbacks: LLMCallbacks
): Promise<string> {
	return new Promise((resolve, reject) => {
		requestQueue.push({ userMessage, callbacks, resolve, reject });
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
	currentOnChunk = null;
	currentOnDone = null;
	stdoutBuffer = "";
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

// Initial spawn
spawnLlama();
