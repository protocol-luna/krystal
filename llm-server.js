// src/llm-server.ts
import { createServer } from "node:http";
import { spawn } from "node:child_process";

// src/config.ts
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { cpus } from "node:os";
var ROOT = process.cwd();
var configPath = join(ROOT, "config.yml");
var cfg = existsSync(configPath) ? yaml.load(readFileSync(configPath, "utf-8")) : {};
function v(key, fallback) {
  return cfg[key] ?? fallback;
}
function loadSystemPrompt() {
  const promptPath = join(ROOT, "prompt.txt");
  try {
    return readFileSync(promptPath, "utf-8").trim();
  } catch {
    console.warn(
      `prompt.txt introuvable (${promptPath}), fallback sur prompt par d\xE9faut.`
    );
    return "Your name is Luna. You are playful 21 year old girl";
  }
}
var SYSTEM_PROMPT = loadSystemPrompt();
var rawDiscordToken = process.env.DISCORD_TOKEN;
var DISCORD_TOKEN = rawDiscordToken ?? (() => {
  console.error("DISCORD_TOKEN manquant dans .env");
  process.exit(1);
})();
var LLAMA_CLI_PATH = process.env.LLAMA_CLI_PATH ?? "llama/llama-cli";
var LLAMA_MODEL_PATH = process.env.LLAMA_MODEL_PATH ?? join(ROOT, "models", "Discord-Hermes-3-8B.Q2_K.gguf");
var PORT = process.env.PORT ?? "3124";
var jinjaTemplate = "{% for message in messages %}{{'<|im_start|>' + message['role']}}{% if message['name'] %}{{' name=' + message['name']}}{% endif %}{{'\\n' + message['content'] + '<|im_end|>\n'}}{% endfor %}{% if add_generation_prompt %}{{'<|im_start|>assistant\\n'}}{% endif %}";
var names = v("names", ["Luna", "Pixie"]);
var keywords = v("keywords", [
  "hello",
  "hi",
  "hey",
  "yo",
  "help",
  "question",
  "ai",
  "llm",
  "bot"
]);
var randomChance = v("random_chance", 0.015);
var cooldownSeconds = v("cooldown_seconds", 8);
var replyInDM = v("reply_in_dm", true);
var responseDelayMin = v("response_delay_min", 800);
var responseDelayMax = v("response_delay_max", 4e3);
var reactionChance = v("reaction_chance", 0.06);
var ignoreChance = v("ignore_chance", 0.08);
var ignoreChanceMention = v("ignore_chance_mention", 0);
var serverEmojiChance = v("server_emoji_chance", 0.3);
var reactions = v("reactions", [
  "\u{1F440}",
  "\u{1F604}",
  "\u{1F914}",
  "\u{1F44B}",
  "\u{1F525}",
  "\u{1F480}",
  "\u2728",
  "\u{1F62D}",
  "\u{1F928}",
  "\u{1F44C}",
  "\u{1F64F}",
  "\u{1F485}",
  "\u{1F5FF}",
  "\u{1F31A}"
]);
var spontaneousIntervalMs = v(
  "spontaneous_interval_ms",
  3e5
);
var spontaneousChance = v("spontaneous_chance", 0.12);
var spontaneousContextMessages = v(
  "spontaneous_context_messages",
  5
);
var voiceMessageChance = v("voice_message_chance", 0.08);
var ttsModelPath = process.env.TTS_MODEL_PATH ?? join(ROOT, "tts-engine/en_GB-southern_english_female-low.onnx");
var ttsBinaryPath = process.env.TTS_BINARY_PATH ?? join(ROOT, "piper/piper");
var rawStyles = v("reply_styles", [
  { message_reference: true, mention_replied_user: false, weight: 50 },
  { message_reference: true, mention_replied_user: true, weight: 15 },
  { message_reference: false, mention_replied_user: false, weight: 30 },
  { message_reference: false, mention_replied_user: true, weight: 5 }
]);
var replyStyles = rawStyles.map(
  (s) => ({
    style: {
      messageReference: s.message_reference,
      mentionRepliedUser: s.mention_replied_user
    },
    weight: s.weight
  })
);
var cpuCount = cpus().length;
var llamaArgs = [
  "-m",
  LLAMA_MODEL_PATH,
  "-t",
  String(cpuCount),
  "-tb",
  String(cpuCount),
  "-b",
  "4096",
  "-ub",
  "256",
  "--mlock",
  "-c",
  "4096",
  "-cnv",
  "--simple-io",
  "--temp",
  "0.75",
  "--dynatemp-range",
  "0.15",
  "--top-k",
  "40",
  "--top-p",
  "0.95",
  "--min-p",
  "0.05",
  "--repeat-penalty",
  "1.12",
  "--repeat-last-n",
  "256",
  "--presence-penalty",
  "0.1",
  "-sys",
  SYSTEM_PROMPT,
  "--chat-template",
  jinjaTemplate
];

// src/llm-server.ts
var PORT2 = Number.parseInt(process.env.LLM_PORT ?? "3124", 10);
console.log(`Lancement du CLI: ${LLAMA_CLI_PATH} ${llamaArgs.join(" ")}`);
var llama = spawn(LLAMA_CLI_PATH, llamaArgs);
var requestQueue = [];
var isProcessing = false;
var currentOnChunk = null;
var currentOnDone = null;
var currentOnFirstToken = null;
var isModelReady = false;
var stdoutBuffer = "";
var currentUsername = "";
function cleanLine(line) {
  let cleaned = line;
  cleaned = cleaned.replace(/\[\s*Prompt:[\s\S]*?\]/g, "");
  cleaned = cleaned.replace(/\[\s*User:\s*.*?\s*\]/gi, "");
  cleaned = cleaned.replace(
    new RegExp(`^\\s*(Luna|Luna\\s*Bot|${currentUsername})\\s*:\\s*`, "i"),
    ""
  );
  return cleaned.trim();
}
function cleanFullResponse(text) {
  let cleaned = text;
  cleaned = cleaned.replace(/\[\s*Prompt:[\s\S]*?\]/g, "");
  cleaned = cleaned.replace(/\[\s*User:\s*.*?\s*\]/gi, "");
  cleaned = cleaned.replace(
    new RegExp(`^\\s*(Luna|Luna\\s*Bot|${currentUsername})\\s*:\\s*`, "im"),
    ""
  );
  return cleaned.trim();
}
llama.stdout.on("data", (data) => {
  const str = data.toString();
  if (!isModelReady) {
    if (str.includes("> ") || str.includes("Enter no prompt")) {
      isModelReady = true;
      console.log("-> Le mod\xE8le llama.cpp est pr\xEAt \xE0 recevoir des messages !");
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
    const cleaned2 = cleanFullResponse(fullText);
    for (const line of cleaned2.split("\n")) {
      const l = line.trim();
      if (l) {
        currentOnChunk?.(l);
      }
    }
    if (currentOnDone) {
      currentOnDone(cleaned2);
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
});
llama.stderr.on("data", (data) => {
  const msg = data.toString();
  if (msg.toLowerCase().includes("error") || msg.toLowerCase().includes("failed")) {
    process.stderr.write(msg);
  }
});
llama.on("close", (code) => {
  console.error(`Le processus llama-cli s'est arr\xEAt\xE9 avec le code : ${code}`);
  process.exit(code ?? 1);
});
function processQueue() {
  if (isProcessing || requestQueue.length === 0 || !isModelReady) {
    return;
  }
  isProcessing = true;
  const { userMessage, callbacks, resolve } = requestQueue.shift();
  stdoutBuffer = "";
  currentUsername = userMessage.username;
  currentOnFirstToken = callbacks.onFirstToken;
  currentOnChunk = callbacks.onChunk;
  currentOnDone = (text) => {
    currentOnChunk = null;
    currentOnDone = null;
    resolve(text);
    isProcessing = false;
    setTimeout(() => processQueue(), 100);
  };
  llama.stdin.write(`${userMessage.username}: ${userMessage.text}
`);
}
function askLLM(userMessage, callbacks) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ userMessage, callbacks, resolve, reject });
    void processQueue();
  });
}
createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  if (req.method === "POST" && url.pathname === "/ask") {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      const { username, text } = JSON.parse(body);
      res.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*"
      });
      askLLM(
        { username, text },
        {
          onFirstToken: () => {
            res.write(`${JSON.stringify({ type: "firstToken" })}
`);
          },
          onChunk: (chunk) => {
            res.write(`${JSON.stringify({ type: "chunk", data: chunk })}
`);
          }
        }
      ).then((full) => {
        res.write(`${JSON.stringify({ type: "done", data: full })}
`);
        res.end();
      }).catch((err) => {
        res.write(
          `${JSON.stringify({ type: "error", data: err.message })}
`
        );
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
    llama.stdin.write("/clear\n");
    res.writeHead(200, { "Access-Control-Allow-Origin": "*" });
    res.end("ok");
    return;
  }
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(
      JSON.stringify({
        ready: isModelReady,
        busy: isProcessing || requestQueue.length > 0,
        queued: requestQueue.length
      })
    );
    return;
  }
  res.writeHead(404);
  res.end("not found");
}).listen(PORT2, () => {
  console.log(`LLM server listening on port ${PORT2}`);
});
