import { spawn } from "node:child_process";
import { LLAMA_CLI_PATH, llamaArgs } from "./config.js";

interface UserMessage {
	username: string;
	text: string;
}

interface LLMCallbacks {
	onFirstToken: () => void;
	onChunk: (chunk: string) => void;
}

interface QueueItem {
	userMessage: UserMessage;
	callbacks: LLMCallbacks;
	resolve: (value: string) => void;
	reject: (reason: unknown) => void;
}

console.log(`Lancement du CLI: ${LLAMA_CLI_PATH} ${llamaArgs.join(" ")}`);
const llama = spawn(LLAMA_CLI_PATH, llamaArgs);

const requestQueue: QueueItem[] = [];
let isProcessing = false;
let currentOnChunk: ((chunk: string) => void) | null = null;
let currentOnDone: ((text: string) => void) | null = null;
let currentOnFirstToken: (() => void) | null = null;
let isModelReady = false;
let stdoutBuffer = "";
let currentUsername = "";

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

llama.stdout!.on("data", (data: Buffer) => {
	const str = data.toString();

	if (!isModelReady) {
		if (str.includes("> ") || str.includes("Enter no prompt")) {
			isModelReady = true;
			console.log("-> Le modèle llama.cpp est prêt à recevoir des messages !");
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

	// Check if response is complete (prompt marker at end)
	const endMatch = stdoutBuffer.match(/\n> $/);
	if (endMatch) {
		const fullText = stdoutBuffer.slice(0, endMatch.index);
		stdoutBuffer = "";
		const cleaned = cleanFullResponse(fullText);
		// Emit any remaining lines from the full response
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

	// Don't emit if buffer looks like it just contains a prompt marker
	if (stdoutBuffer.trim() === ">") {
		return;
	}

	// Extract complete lines (everything before the last \n)
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
});

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
	console.error(`Le processus llama-cli s'est arrêté avec le code : ${code}`);
	process.exit(code ?? 1);
});

function processQueue(): void {
	if (isProcessing || requestQueue.length === 0 || !isModelReady) {
		return;
	}
	isProcessing = true;

	const { userMessage, callbacks, resolve } = requestQueue.shift()!;
	stdoutBuffer = "";
	currentUsername = userMessage.username;

	currentOnFirstToken = callbacks.onFirstToken;
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
	return isProcessing || requestQueue.length > 0;
}

export function resetLLM(): void {
	requestQueue.length = 0;
	isProcessing = false;
	currentOnChunk = null;
	currentOnDone = null;
	stdoutBuffer = "";
	llama.stdin!.write("/clear\n");
}
