var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/config.ts
import { readFileSync, existsSync, watch } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { cpus } from "node:os";
function v(key, fallback) {
  return rawCfg[key] ?? fallback;
}
var ROOT, configPath, rawCfg, DISCORD_TOKEN, LLAMA_CLI_PATH, LLAMA_MODEL_PATH, LLM_HOST, LLM_PORT, LLM_MODE, SYSTEM_PROMPT, jinjaTemplate, ttsModelPath, ttsBinaryPath, ffmpegPath, ffprobePath, cpuCount, llamaArgs;
var init_config = __esm({
  "src/config.ts"() {
    "use strict";
    ROOT = process.cwd();
    configPath = join(ROOT, "config.yml");
    rawCfg = existsSync(configPath) ? yaml.load(readFileSync(configPath, "utf-8")) : {};
    DISCORD_TOKEN = v("discord_token", null) ?? process.env.DISCORD_TOKEN ?? (() => {
      console.error("DISCORD_TOKEN manquant \u2014 mets-le dans config.yml ou .env");
      process.exit(1);
    })();
    LLAMA_CLI_PATH = v("llama_cli_path", null) ?? process.env.LLAMA_CLI_PATH ?? "llama/llama-cli";
    LLAMA_MODEL_PATH = v("llama_model_path", null) ?? process.env.LLAMA_MODEL_PATH ?? join(ROOT, "models", "Discord-Hermes-3-8B.Q2_K.gguf");
    LLM_HOST = v("llm_host", null) ?? process.env.LLM_HOST ?? "localhost";
    LLM_PORT = v("llm_port", null) ?? Number.parseInt(process.env.LLM_PORT ?? "3124", 10);
    LLM_MODE = v("llm_mode", null) ?? process.env.LLM_MODE ?? "cli";
    SYSTEM_PROMPT = (() => {
      const fromYaml = v("system_prompt", null);
      if (fromYaml) {
        return fromYaml;
      }
      const promptPath = join(ROOT, "prompt.txt");
      try {
        return readFileSync(promptPath, "utf-8").trim();
      } catch {
        console.warn(
          "[config] ni system_prompt dans config.yml ni prompt.txt trouv\xE9, fallback sur prompt par d\xE9faut."
        );
        return "Your name is Luna. You are playful 21 year old girl";
      }
    })();
    jinjaTemplate = "{% for message in messages %}{{'<|im_start|>' + message['role']}}{% if message['name'] %}{{' name=' + message['name']}}{% endif %}{{'\\n' + message['content'] + '<|im_end|>\n'}}{% endfor %}{% if add_generation_prompt %}{{'<|im_start|>assistant\\n'}}{% endif %}";
    ttsModelPath = v("tts_model_path", null) ?? process.env.TTS_MODEL_PATH ?? join(ROOT, "tts-engine/en_GB-southern_english_female-low.onnx");
    ttsBinaryPath = v("tts_binary_path", null) ?? process.env.TTS_BINARY_PATH ?? join(ROOT, "bin/piper/piper");
    ffmpegPath = v("ffmpeg_path", null) ?? process.env.FFMPEG_PATH ?? join(ROOT, "bin/ffmpeg/ffmpeg");
    ffprobePath = v("ffprobe_path", null) ?? process.env.FFPROBE_PATH ?? join(ROOT, "bin/ffmpeg/ffprobe");
    cpuCount = cpus().length;
    llamaArgs = [
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
  }
});

// src/core/bus.ts
var TypedBus;
var init_bus = __esm({
  "src/core/bus.ts"() {
    "use strict";
    TypedBus = class {
      listeners = /* @__PURE__ */ new Map();
      on(event, listener) {
        if (!this.listeners.has(event)) {
          this.listeners.set(event, /* @__PURE__ */ new Set());
        }
        this.listeners.get(event).add(listener);
      }
      off(event, listener) {
        this.listeners.get(event)?.delete(listener);
      }
      once(event, listener) {
        const wrapper = (...args) => {
          this.off(event, wrapper);
          listener(...args);
        };
        this.on(event, wrapper);
      }
      emit(event, ...args) {
        this.listeners.get(event)?.forEach((fn) => {
          fn(...args);
        });
      }
      removeAll() {
        this.listeners.clear();
      }
    };
  }
});

// src/core/llm-bus.ts
var llmBus;
var init_llm_bus = __esm({
  "src/core/llm-bus.ts"() {
    "use strict";
    init_bus();
    llmBus = new TypedBus();
  }
});

// src/core/llm-core.ts
var llm_core_exports = {};
__export(llm_core_exports, {
  askLLM: () => askLLM,
  isLLMBusy: () => isLLMBusy,
  resetLLM: () => resetLLM,
  shutdown: () => shutdown
});
import { spawn } from "node:child_process";
function spawnLlama() {
  if (LLM_MODE !== "cli") {
    return;
  }
  console.log(`[llm-core] spawn: ${LLAMA_CLI_PATH} ${llamaArgs.join(" ")}`);
  llama = spawn(LLAMA_CLI_PATH, llamaArgs);
  isModelReady = false;
  stdoutBuffer = "";
  isProcessing = false;
  llama.stdout.on("data", handleStdout);
  llama.stderr.on("data", (data) => {
    const msg = data.toString();
    if (msg.toLowerCase().includes("error") || msg.toLowerCase().includes("failed")) {
      process.stderr.write(msg);
    }
  });
  llama.on("close", (code) => {
    if (shutdownRequested) {
      console.log("[llm-core] llama-cli arr\xEAt\xE9 proprement");
      return;
    }
    console.error(`[llm-core] llama-cli crash\xE9 (code=${code}), red\xE9marrage...`);
    llmBus.emit("crash", code);
    scheduleRestart();
  });
  llama.on("error", (err) => {
    console.error(`[llm-core] erreur spawn: ${err.message}`);
    llmBus.emit("error", err);
    scheduleRestart();
  });
}
function scheduleRestart() {
  restartCount++;
  if (restartCount > MAX_RESTARTS) {
    console.error(
      `[llm-core] ${MAX_RESTARTS} tentatives de red\xE9marrage \xE9chou\xE9es, abandon`
    );
    process.exit(1);
  }
  const delay = restartDelay;
  restartDelay = Math.min(restartDelay * 2, 3e4);
  console.log(
    `[llm-core] nouvelle tentative dans ${delay}ms (tentative ${restartCount}/${MAX_RESTARTS})`
  );
  setTimeout(() => {
    spawnLlama();
  }, delay);
}
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
function handleStdout(data) {
  const str = data.toString();
  if (!isModelReady) {
    if (str.includes("> ") || str.includes("Enter no prompt")) {
      isModelReady = true;
      restartCount = 0;
      restartDelay = 1e3;
      llmBus.emit("ready");
      console.log("[llm-core] mod\xE8le pr\xEAt");
      void processQueue();
    }
    return;
  }
  stdoutBuffer += str;
  const endMatch = stdoutBuffer.match(/\n> $/);
  if (endMatch) {
    const fullText = stdoutBuffer.slice(0, endMatch.index);
    stdoutBuffer = "";
    const cleaned2 = cleanFullResponse(fullText);
    const lines = cleaned2.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const l of lines) {
      if (!hasSentFirstToken) {
        hasSentFirstToken = true;
        currentItem?.onFirstToken?.();
      }
      llmBus.emit("token", l);
      currentItem?.onChunk?.(l);
    }
    llmBus.emit("done", cleaned2);
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
function cliRequest(item) {
  currentUsername = item.userMessage.username;
  stdoutBuffer = "";
  llama.stdin.write(
    `${item.userMessage.username}: ${item.userMessage.text}
`
  );
}
async function serverRequest(item) {
  try {
    const response = await fetch(`${LLM_BASE}/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: `${item.userMessage.username}: ${item.userMessage.text}`,
        stream: true,
        n_predict: 512,
        ...serverParams
      })
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
          const data = JSON.parse(line.slice(6));
          const content = data.content ?? "";
          if (content) {
            if (!hasSentFirstToken) {
              hasSentFirstToken = true;
              currentItem?.onFirstToken?.();
            }
            fullText += content;
            llmBus.emit("token", content);
            currentItem?.onChunk?.(content);
          }
          if (data.stop) {
            llmBus.emit("done", fullText);
            return;
          }
        } catch {
        }
      }
    }
    llmBus.emit("done", fullText);
  } catch (err) {
    llmBus.emit("error", err);
    throw err;
  }
}
function processQueue() {
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
  const finish = (text) => {
    currentItem = null;
    isProcessing = false;
    item.resolve(text);
    setTimeout(() => processQueue(), 100);
  };
  const fail = (err) => {
    currentItem = null;
    isProcessing = false;
    item.reject(err);
    setTimeout(() => processQueue(), 100);
  };
  const doneHandler = (text) => {
    llmBus.off("done", doneHandler);
    finish(text);
  };
  llmBus.on("done", doneHandler);
  if (LLM_MODE === "server") {
    void serverRequest(item).catch((err) => {
      llmBus.off("done", doneHandler);
      fail(err);
    });
  } else {
    cliRequest(item);
  }
}
function askLLM(userMessage, callbacks) {
  return new Promise((resolve, reject) => {
    requestQueue.push({
      userMessage,
      resolve,
      reject,
      onFirstToken: callbacks?.onFirstToken,
      onChunk: callbacks?.onChunk
    });
    void processQueue();
  });
}
function isLLMBusy() {
  return isProcessing || queueHead < requestQueue.length;
}
async function resetLLM() {
  requestQueue.length = 0;
  queueHead = 0;
  isProcessing = false;
  currentItem = null;
  llmBus.emit("reset");
  if (LLM_MODE === "server") {
    return;
  }
  stdoutBuffer = "";
  llama.stdin.write("/clear\n");
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 5e3);
    const listener = (data) => {
      const str = data.toString();
      if (str.includes("\n> ") || str.endsWith("> ")) {
        clearTimeout(timeout);
        llama.stdout.off("data", listener);
        resolve();
      }
    };
    llama.stdout.on("data", listener);
  });
}
function shutdown() {
  if (LLM_MODE !== "cli") {
    return;
  }
  shutdownRequested = true;
  llama?.kill();
}
var requestQueue, queueHead, isProcessing, currentItem, hasSentFirstToken, isModelReady, stdoutBuffer, currentUsername, llama, shutdownRequested, restartCount, MAX_RESTARTS, restartDelay, LLM_BASE, serverParams;
var init_llm_core = __esm({
  "src/core/llm-core.ts"() {
    "use strict";
    init_config();
    init_llm_bus();
    requestQueue = [];
    queueHead = 0;
    isProcessing = false;
    currentItem = null;
    hasSentFirstToken = false;
    isModelReady = LLM_MODE === "server";
    stdoutBuffer = "";
    currentUsername = "";
    shutdownRequested = false;
    restartCount = 0;
    MAX_RESTARTS = 5;
    restartDelay = 1e3;
    LLM_BASE = `http://${LLM_HOST}:${LLM_PORT}`;
    serverParams = (() => {
      const args = llamaArgs;
      const map = {};
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
    if (LLM_MODE === "cli") {
      spawnLlama();
    }
  }
});

// src/core/llm-server.ts
init_config();
init_llm_core();
import { createServer } from "node:http";
var PORT = LLM_PORT;
createServer(async (req, res) => {
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
    await resetLLM();
    res.writeHead(200, { "Access-Control-Allow-Origin": "*" });
    res.end("ok");
    return;
  }
  if (req.method === "GET" && url.pathname === "/health") {
    const { isLLMBusy: isLLMBusy2 } = await Promise.resolve().then(() => (init_llm_core(), llm_core_exports));
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(
      JSON.stringify({
        ready: true,
        busy: isLLMBusy2(),
        queued: 0
      })
    );
    return;
  }
  res.writeHead(404);
  res.end("not found");
}).listen(PORT, () => {
  console.log(`LLM server listening on port ${PORT}`);
});
