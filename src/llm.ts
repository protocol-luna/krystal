import { spawn } from "node:child_process";
import { LLAMA_CLI_PATH, llamaArgs } from "./config.js";

interface UserMessage {
  username: string;
  text: string;
}

interface QueueItem {
  userMessage: UserMessage;
  onFirstToken: () => void;
  resolve: (value: string) => void;
  reject: (reason: unknown) => void;
}

console.log(`Lancement du CLI: ${LLAMA_CLI_PATH} ${llamaArgs.join(" ")}`);
const llama = spawn(LLAMA_CLI_PATH, llamaArgs);

const requestQueue: QueueItem[] = [];
let isProcessing = false;
let currentCallback: ((text: string, isDone: boolean) => void) | null = null;
let currentOnFirstToken: (() => void) | null = null;
let isModelReady = false;
let stdoutBuffer = "";
let currentUsername = "";

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

  if (currentCallback && stdoutBuffer.length > 0) {
    if (currentOnFirstToken) {
      currentOnFirstToken();
      currentOnFirstToken = null;
    }

    if (stdoutBuffer.includes("\n> ") || stdoutBuffer.endsWith("> ")) {
      let cleanResponse = stdoutBuffer.replace(/[\n\r]*>[\s]*$/, "");

      cleanResponse = cleanResponse.replace(/\[\s*Prompt:[\s\S]*?\]/g, "");

      const userTagRegex = /\[\s*User:\s*.*?\s*\]/gi;
      cleanResponse = cleanResponse.replace(userTagRegex, "");

      const namePrefixRegex = new RegExp(`^\\s*(Luna|Luna\\s*Bot|${currentUsername})\\s*:\\s*`, "i");
      cleanResponse = cleanResponse.replace(namePrefixRegex, "");

      currentCallback(cleanResponse.trim(), true);
    } else {
      const streamingClean = stdoutBuffer.replace(/\[\s*Prompt:[\s\S]*$/, "");
      currentCallback(streamingClean, false);
    }
  }
});

llama.stderr!.on("data", (data: Buffer) => {
  const msg = data.toString();
  if (msg.toLowerCase().includes("error") || msg.toLowerCase().includes("failed")) {
    process.stderr.write(msg);
  }
});

llama.on("close", (code: number | null) => {
  console.error(`Le processus llama-cli s'est arrêté avec le code : ${code}`);
  process.exit(code ?? 1);
});

function processQueue(): void {
  if (isProcessing || requestQueue.length === 0 || !isModelReady) { return; }
  isProcessing = true;

  const { userMessage, onFirstToken, resolve } = requestQueue.shift()!;
  stdoutBuffer = "";
  currentUsername = userMessage.username;

  currentOnFirstToken = onFirstToken;
  currentCallback = (text: string, isDone: boolean) => {
    if (isDone) {
      currentCallback = null;
      resolve(text.trim());
      isProcessing = false;
      setTimeout(() => processQueue(), 100);
    }
  };

  llama.stdin!.write(`${userMessage.username}: ${userMessage.text}\n`);
}

export function askLLM(
  userMessage: UserMessage,
  onFirstToken: () => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    requestQueue.push({ userMessage, onFirstToken, resolve, reject });
    void processQueue();
  });
}

export function resetLLM(): void {
  requestQueue.length = 0;
  isProcessing = false;
  currentCallback = null;
  stdoutBuffer = "";
  llama.stdin!.write("/clear\n");
}
