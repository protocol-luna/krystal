import { createServer } from "node:http";
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

const PORT = Number.parseInt(process.env.LLM_PORT ?? "3124", 10);

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
  cleaned = cleaned.replace(new RegExp(`^\\s*(Luna|Luna\\s*Bot|${currentUsername})\\s*:\\s*`, "i"), "");
  return cleaned.trim();
}

function cleanFullResponse(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/\[\s*Prompt:[\s\S]*?\]/g, "");
  cleaned = cleaned.replace(/\[\s*User:\s*.*?\s*\]/gi, "");
  cleaned = cleaned.replace(new RegExp(`^\\s*(Luna|Luna\\s*Bot|${currentUsername})\\s*:\\s*`, "im"), "");
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

  if (!(currentOnChunk || currentOnDone)) { return; }

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
      if (l) { currentOnChunk?.(l); }
    }
    if (currentOnDone) { currentOnDone(cleaned); }
    return;
  }

  if (stdoutBuffer.trim() === ">") { return; }

  const lastNewline = stdoutBuffer.lastIndexOf("\n");
  if (lastNewline === -1) { return; }

  const chunk = stdoutBuffer.slice(0, lastNewline);
  stdoutBuffer = stdoutBuffer.slice(lastNewline + 1);

  const cleaned = cleanLine(chunk);
  if (cleaned) { currentOnChunk?.(cleaned); }
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

function askLLM(
  userMessage: UserMessage,
  callbacks: LLMCallbacks,
): Promise<string> {
  return new Promise((resolve, reject) => {
    requestQueue.push({ userMessage, callbacks, resolve, reject });
    void processQueue();
  });
}

// --- HTTP SERVER ---
createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/ask") {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const { username, text }: UserMessage = JSON.parse(body);

      res.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      askLLM({ username, text }, {
        onFirstToken: () => {
          res.write(`${JSON.stringify({ type: "firstToken" })}\n`);
        },
        onChunk: (chunk: string) => {
          res.write(`${JSON.stringify({ type: "chunk", data: chunk })}\n`);
        },
      }).then((full: string) => {
        res.write(`${JSON.stringify({ type: "done", data: full })}\n`);
        res.end();
      }).catch((err: unknown) => {
        res.write(`${JSON.stringify({ type: "error", data: (err as Error).message })}\n`);
        res.end();
      });
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/reset") {
    requestQueue.length = 0;
    isProcessing = false;
    currentOnChunk = null;
    currentOnDone = null;
    stdoutBuffer = "";
    llama.stdin!.write("/clear\n");
    res.writeHead(200, { "Access-Control-Allow-Origin": "*" });
    res.end("ok");
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({
      ready: isModelReady,
      busy: isProcessing || requestQueue.length > 0,
      queued: requestQueue.length,
    }));
    return;
  }

  res.writeHead(404);
  res.end("not found");
}).listen(PORT, () => {
  console.log(`LLM server listening on port ${PORT}`);
});
