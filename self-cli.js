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
function watchConfig() {
  if (!existsSync(configPath)) {
    return;
  }
  watch(configPath, (event) => {
    if (event !== "change") {
      return;
    }
    try {
      rawCfg = yaml.load(readFileSync(configPath, "utf-8"));
      console.log("[config] hot-reloaded config.yml");
    } catch (err) {
      console.error("[config] failed to reload config.yml:", err);
    }
  });
}
function mergeConcentration(raw, defaults) {
  const merged = { ...defaults };
  for (const key of Object.keys(
    defaults
  )) {
    const entry = raw[key];
    if (entry) {
      merged[key] = {
        delay_min: entry.delay_min ?? defaults[key].delay_min,
        delay_max: entry.delay_max ?? defaults[key].delay_max,
        ignore_chance: entry.ignore_chance ?? defaults[key].ignore_chance,
        reaction_chance: entry.reaction_chance ?? defaults[key].reaction_chance
      };
    }
  }
  return merged;
}
function pickReplyStyle(isActiveConversation) {
  const styles = config.replyStyles;
  if (!isActiveConversation) {
    const roll2 = Math.random();
    if (roll2 < 0.7) {
      return { messageReference: true, mentionRepliedUser: false };
    }
    if (roll2 < 0.9) {
      return { messageReference: true, mentionRepliedUser: true };
    }
    return { messageReference: false, mentionRepliedUser: false };
  }
  const total = styles.reduce((s, e) => s + e.weight, 0);
  let roll = Math.random() * total;
  for (const entry of styles) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.style;
    }
  }
  return styles[0].style;
}
var ROOT, configPath, rawCfg, DISCORD_TOKEN, LLAMA_CLI_PATH, LLAMA_MODEL_PATH, LLM_HOST, LLM_PORT, LLM_MODE, SYSTEM_PROMPT, jinjaTemplate, ttsModelPath, ttsBinaryPath, ffmpegPath, ffprobePath, cpuCount, llamaArgs, DEFAULT_CONCENTRATION, config;
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
    DEFAULT_CONCENTRATION = {
      mention: {
        delay_min: 300,
        delay_max: 1500,
        ignore_chance: 0,
        reaction_chance: 0.08
      },
      dm: {
        delay_min: 400,
        delay_max: 1800,
        ignore_chance: 0,
        reaction_chance: 0.05
      },
      name: {
        delay_min: 800,
        delay_max: 4e3,
        ignore_chance: 0.05,
        reaction_chance: 0.06
      },
      keyword: {
        delay_min: 1e3,
        delay_max: 3500,
        ignore_chance: 0.08,
        reaction_chance: 0.04
      },
      "follow-up": {
        delay_min: 500,
        delay_max: 2e3,
        ignore_chance: 0,
        reaction_chance: 0.03
      },
      random: {
        delay_min: 1500,
        delay_max: 5e3,
        ignore_chance: 0.15,
        reaction_chance: 0.02
      },
      default: {
        delay_min: 800,
        delay_max: 4e3,
        ignore_chance: 0.08,
        reaction_chance: 0.06
      }
    };
    config = {
      get names() {
        return v("names", ["Luna", "Pixie"]);
      },
      get keywords() {
        return v("keywords", [
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
      },
      get randomChance() {
        return v("random_chance", 0.015);
      },
      get cooldownSeconds() {
        return v("cooldown_seconds", 8);
      },
      get replyInDM() {
        return v("reply_in_dm", true);
      },
      get concentration() {
        return mergeConcentration(
          v("concentration", {}),
          DEFAULT_CONCENTRATION
        );
      },
      get serverEmojiChance() {
        return v("server_emoji_chance", 0.3);
      },
      get reactions() {
        return v("reactions", [
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
      },
      get spontaneousIntervalMs() {
        return v("spontaneous_interval_ms", 3e5);
      },
      get spontaneousChance() {
        return v("spontaneous_chance", 0.12);
      },
      get spontaneousContextMessages() {
        return v("spontaneous_context_messages", 5);
      },
      get spontaneousWhitelist() {
        return v("spontaneous_whitelist", "*");
      },
      get typoChance() {
        return v("typo_chance", 0.06);
      },
      get typoLayout() {
        return v("typo_layout", "azerty");
      },
      get typoCorrectionDelay() {
        return v("typo_correction_delay_min", 2e3);
      },
      get typoCorrectionDelayMax() {
        return v("typo_correction_delay_max", 4e3);
      },
      get typoCorrectionStyle() {
        return v("typo_correction_style", "mixed");
      },
      get chunkDelayMin() {
        return v("chunk_delay_min", 300);
      },
      get chunkDelayMax() {
        return v("chunk_delay_max", 1500);
      },
      get voiceMessageChance() {
        return v("voice_message_chance", 0.08);
      },
      get sleepSchedule() {
        const raw = v("sleep_schedule", {
          enabled: false,
          start: "23:00",
          end: "08:00",
          timezone: "Europe/Paris",
          behavior: "sleep"
        });
        return {
          enabled: raw.enabled === true,
          start: raw.start ?? "23:00",
          end: raw.end ?? "08:00",
          timezone: raw.timezone ?? "Europe/Paris",
          behavior: raw.behavior ?? "sleep"
        };
      },
      get replyStyles() {
        const raw = v("reply_styles", [
          { message_reference: true, mention_replied_user: false, weight: 50 },
          { message_reference: true, mention_replied_user: true, weight: 15 },
          { message_reference: false, mention_replied_user: false, weight: 30 },
          { message_reference: false, mention_replied_user: true, weight: 5 }
        ]);
        return raw.map((s) => ({
          style: {
            messageReference: s.message_reference,
            mentionRepliedUser: s.mention_replied_user
          },
          weight: s.weight
        }));
      }
    };
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
  return new Promise((resolve2, reject) => {
    requestQueue.push({
      userMessage,
      resolve: resolve2,
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
  await new Promise((resolve2) => {
    const timeout = setTimeout(resolve2, 5e3);
    const listener = (data) => {
      const str = data.toString();
      if (str.includes("\n> ") || str.endsWith("> ")) {
        clearTimeout(timeout);
        llama.stdout.off("data", listener);
        resolve2();
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

// src/state/state-bus.ts
var stateBus;
var init_state_bus = __esm({
  "src/state/state-bus.ts"() {
    "use strict";
    init_bus();
    stateBus = new TypedBus();
  }
});

// src/state/state.ts
var state_exports = {};
__export(state_exports, {
  FOLLOWUP_WINDOW: () => FOLLOWUP_WINDOW,
  MAX_FOLLOWUPS: () => MAX_FOLLOWUPS,
  canFollowUp: () => canFollowUp,
  clearCooldown: () => clearCooldown,
  dumpState: () => dumpState,
  isInConversation: () => isInConversation,
  isOnCooldown: () => isOnCooldown,
  isPaused: () => isPaused,
  isRecentBotActivity: () => isRecentBotActivity,
  markBotActivity: () => markBotActivity,
  markReplied: () => markReplied,
  restoreState: () => restoreState,
  setPaused: () => setPaused,
  startPruning: () => startPruning,
  trackSpeaker: () => trackSpeaker
});
function isPaused() {
  return paused;
}
function setPaused(v2) {
  paused = v2;
  stateBus.emit("state:changed");
}
function isOnCooldown(channelId) {
  const last = channelCooldowns.get(channelId);
  if (!last) {
    return false;
  }
  return Date.now() - last < config.cooldownSeconds * 1e3;
}
function markReplied(channelId) {
  const now = Date.now();
  channelCooldowns.set(channelId, now);
  botActivity.set(channelId, now);
  const count = responseCount.get(channelId) ?? 0;
  responseCount.set(channelId, count + 1);
  setTimeout(() => {
    const c = responseCount.get(channelId) ?? 1;
    responseCount.set(channelId, Math.max(0, c - 1));
  }, FOLLOWUP_WINDOW);
  stateBus.emit("state:changed");
}
function markBotActivity(channelId) {
  botActivity.set(channelId, Date.now());
  stateBus.emit("state:changed");
}
function isRecentBotActivity(channelId, windowMs = 15e3) {
  const last = botActivity.get(channelId);
  if (!last) {
    return false;
  }
  return Date.now() - last < windowMs;
}
function trackSpeaker(channelId, authorId) {
  const previous = lastSpeaker.get(channelId);
  lastSpeaker.set(channelId, { userId: authorId, timestamp: Date.now() });
  stateBus.emit("state:changed");
  return previous?.userId;
}
function canFollowUp(channelId, botId) {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  const ok = recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
  console.log(
    `[state] canFollowUp=${ok} (recentBot=${recent} lastSpeaker=${speaker?.userId === botId ? "bot" : speaker?.userId?.slice(0, 6) ?? "?"} followCount=${count})`
  );
  return ok;
}
function isInConversation(channelId, botId) {
  return isRecentBotActivity(channelId) && lastSpeaker.get(channelId)?.userId === botId;
}
function clearCooldown(channelId) {
  channelCooldowns.delete(channelId);
  botActivity.delete(channelId);
  responseCount.delete(channelId);
  lastSpeaker.delete(channelId);
  stateBus.emit("state:changed");
}
function dumpState() {
  return {
    channelCooldowns: [...channelCooldowns.entries()],
    botActivity: [...botActivity.entries()],
    lastSpeaker: [...lastSpeaker.entries()],
    responseCount: [...responseCount.entries()],
    paused
  };
}
function restoreState(data) {
  for (const [k, v2] of data.channelCooldowns) {
    channelCooldowns.set(k, v2);
  }
  for (const [k, v2] of data.botActivity) {
    botActivity.set(k, v2);
  }
  for (const [k, v2] of data.lastSpeaker) {
    lastSpeaker.set(k, v2);
  }
  for (const [k, v2] of data.responseCount) {
    responseCount.set(k, v2);
  }
  paused = data.paused;
}
function startPruning() {
  setInterval(() => {
    const now = Date.now();
    const cutoff = now - PRUNE_CUTOFF;
    for (const [key, ts] of channelCooldowns) {
      if (ts < cutoff) {
        channelCooldowns.delete(key);
      }
    }
    for (const [key, ts] of botActivity) {
      if (ts < cutoff) {
        botActivity.delete(key);
      }
    }
    for (const [key, entry] of lastSpeaker) {
      if (entry.timestamp < cutoff) {
        lastSpeaker.delete(key);
      }
    }
    for (const [key, count] of responseCount) {
      if (count <= 0) {
        responseCount.delete(key);
      }
    }
  }, PRUNE_INTERVAL);
}
var channelCooldowns, botActivity, lastSpeaker, responseCount, MAX_FOLLOWUPS, FOLLOWUP_WINDOW, PRUNE_INTERVAL, PRUNE_CUTOFF, paused;
var init_state = __esm({
  "src/state/state.ts"() {
    "use strict";
    init_config();
    init_state_bus();
    channelCooldowns = /* @__PURE__ */ new Map();
    botActivity = /* @__PURE__ */ new Map();
    lastSpeaker = /* @__PURE__ */ new Map();
    responseCount = /* @__PURE__ */ new Map();
    MAX_FOLLOWUPS = 3;
    FOLLOWUP_WINDOW = 6e4;
    PRUNE_INTERVAL = 5 * 6e4;
    PRUNE_CUTOFF = 36e5;
    paused = false;
  }
});

// src/state/trigger.ts
function log(channel, msg) {
  console.log(`[trigger] #${channel} ${msg}`);
}
function hasWord(text, word) {
  return new RegExp(
    `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`
  ).test(text);
}
function evaluateMessage(message, botId, botUsername, isFollowUp = false) {
  const channelId = message.channel.id;
  if (message.author.bot) {
    log(channelId, `"${message.content.slice(0, 60)}" auteur=bot \u2192 ignore`);
    return { shouldRespond: false, reason: null, botName: "" };
  }
  if (message.content === "-stop") {
    log(channelId, "commande -stop \u2192 stop");
    return { shouldRespond: true, reason: "stop", botName: "" };
  }
  if (message.content === "-start") {
    log(channelId, "commande -start \u2192 start");
    return { shouldRespond: true, reason: "start", botName: "" };
  }
  if (message.content === "-clear") {
    log(channelId, "commande -clear \u2192 clear");
    return { shouldRespond: true, reason: "clear", botName: "" };
  }
  const isMe = botId === message.author.id;
  if (isMe) {
    return { shouldRespond: false, reason: null, botName: "" };
  }
  const guild = message.channel.guild;
  const botMember = guild?.members?.get(botId);
  const botName = botMember?.nick || botUsername;
  const contentLower = message.content.toLowerCase();
  const isMentioned = message.mentions.some((u) => u.id === botId);
  const isDM = message.channel.type === 1;
  const author = message.member?.nick || message.author.username;
  if (isMentioned) {
    log(channelId, `${author}: "${message.content.slice(0, 60)}" \u2192 mention`);
    setPaused(false);
    return { shouldRespond: true, reason: "mention", botName };
  }
  if (isDM && config.replyInDM) {
    log(channelId, `${author}: "${message.content.slice(0, 60)}" \u2192 dm`);
    return { shouldRespond: true, reason: "dm", botName };
  }
  if (isDM) {
    log(channelId, `${author}: "${message.content.slice(0, 60)}" \u2192 DM ignor\xE9`);
    return { shouldRespond: false, reason: null, botName };
  }
  if (isPaused()) {
    log(channelId, `${author}: "${message.content.slice(0, 60)}" \u2192 paused`);
    return { shouldRespond: false, reason: null, botName: "" };
  }
  if (isOnCooldown(channelId) && !isMentioned && !isFollowUp) {
    log(channelId, `${author}: "${message.content.slice(0, 60)}" \u2192 cooldown`);
    return { shouldRespond: false, reason: null, botName };
  }
  if (hasWord(contentLower, botName.toLowerCase())) {
    log(
      channelId,
      `${author}: "${message.content.slice(0, 60)}" \u2192 name (bot:${botName})`
    );
    markReplied(channelId);
    return { shouldRespond: true, reason: "name", botName };
  }
  for (const name of config.names) {
    if (hasWord(contentLower, name.toLowerCase())) {
      log(
        channelId,
        `${author}: "${message.content.slice(0, 60)}" \u2192 name (custom:${name})`
      );
      markReplied(channelId);
      return { shouldRespond: true, reason: "name", botName };
    }
  }
  for (const keyword of config.keywords) {
    if (hasWord(contentLower, keyword.toLowerCase())) {
      log(
        channelId,
        `${author}: "${message.content.slice(0, 60)}" \u2192 keyword (${keyword})`
      );
      markReplied(channelId);
      return { shouldRespond: true, reason: "keyword", botName };
    }
  }
  if (isFollowUp) {
    log(channelId, `${author}: "${message.content.slice(0, 60)}" \u2192 follow-up`);
    return { shouldRespond: true, reason: "follow-up", botName };
  }
  if (config.randomChance > 0 && Math.random() < config.randomChance) {
    log(channelId, `${author}: "${message.content.slice(0, 60)}" \u2192 random`);
    markReplied(channelId);
    return { shouldRespond: true, reason: "random", botName };
  }
  log(channelId, `${author}: "${message.content.slice(0, 60)}" \u2192 rien`);
  return { shouldRespond: false, reason: null, botName };
}
var init_trigger = __esm({
  "src/state/trigger.ts"() {
    "use strict";
    init_config();
    init_state();
  }
});

// src/guild.ts
function isTextChannel(c) {
  return TEXT_CHANNEL_TYPES.has(c.type);
}
function findMostActiveChannel(guild) {
  let mostActive = null;
  let highestId = "0";
  for (const channel of guild.channels.values()) {
    if (!isTextChannel(channel)) {
      continue;
    }
    if (channel.lastMessageID && channel.lastMessageID > highestId) {
      highestId = channel.lastMessageID;
      mostActive = channel;
    }
  }
  return mostActive;
}
var TEXT_CHANNEL_TYPES;
var init_guild = __esm({
  "src/guild.ts"() {
    "use strict";
    TEXT_CHANNEL_TYPES = /* @__PURE__ */ new Set([0, 5, 11, 12]);
  }
});

// src/core/llm-client.ts
async function askLLM2(userMessage, callbacks) {
  const response = await fetch(`${BASE}/ask`, {
    method: "POST",
    body: JSON.stringify(userMessage),
    headers: { "Content-Type": "application/json" }
  });
  if (!(response.ok && response.body)) {
    throw new Error(`LLM server error: ${response.status}`);
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
      if (!line.trim()) {
        continue;
      }
      try {
        const event = JSON.parse(line);
        switch (event.type) {
          case "firstToken":
            callbacks.onFirstToken?.();
            break;
          case "chunk":
            callbacks.onChunk(event.data);
            break;
          case "done":
            fullText = event.data;
            break;
          case "error":
            throw new Error(event.data);
          default:
            break;
        }
      } catch {
      }
    }
  }
  return fullText;
}
async function resetLLM2() {
  const response = await fetch(`${BASE}/reset`, { method: "POST" });
  if (!response.ok) {
    console.error("LLM reset failed:", response.status);
  }
}
async function isLLMBusy2() {
  try {
    const response = await fetch(`${BASE}/health`);
    if (!response.ok) {
      return true;
    }
    const data = await response.json();
    return data.busy;
  } catch {
    return true;
  }
}
var BASE;
var init_llm_client = __esm({
  "src/core/llm-client.ts"() {
    "use strict";
    init_config();
    BASE = `http://localhost:${LLM_PORT}`;
  }
});

// src/spontaneous.ts
function getCachedActiveChannel(guild) {
  const cached = activeChannelCache.get(guild.id);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.channel;
  }
  const channel = findMostActiveChannel(guild);
  if (channel) {
    activeChannelCache.set(guild.id, { channel, timestamp: Date.now() });
    return channel;
  }
}
function pickWeightedGuild(client2) {
  const whitelist = config.spontaneousWhitelist === "*" ? null : new Set(config.spontaneousWhitelist.split(",").map((id) => id.trim()));
  const guilds = [...client2.guilds.values()].filter((g) => {
    if (whitelist && !whitelist.has(g.id)) {
      return false;
    }
    return [...g.channels.values()].some((c) => isTextChannel(c));
  });
  if (guilds.length === 0) {
    return null;
  }
  const ranked = guilds.map((g) => ({
    guild: g,
    channel: getCachedActiveChannel(g)
  })).filter(
    (entry) => entry.channel !== void 0
  ).sort(
    (a, b) => (b.channel.lastMessageID ?? "0").localeCompare(
      a.channel.lastMessageID ?? "0"
    )
  );
  if (ranked.length === 0) {
    return null;
  }
  const total = ranked.length * (ranked.length + 1) / 2;
  let roll = Math.random() * total;
  for (let i = 0; i < ranked.length; i++) {
    roll -= ranked.length - i;
    if (roll <= 0) {
      return ranked[i];
    }
  }
  return ranked[ranked.length - 1];
}
async function fetchContext(channel, count) {
  try {
    const messages = await channel.getMessages({ limit: count });
    const lines = [];
    for (const msg of messages.reverse()) {
      const name = msg.member?.nick || msg.author.username;
      lines.push(`${name}: ${msg.content.replace(/\n/g, " ")}`);
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}
async function trySpawn(client2) {
  if (await isLLMBusy2()) {
    return;
  }
  const picked = pickWeightedGuild(client2);
  if (!picked) {
    return;
  }
  const context = await fetchContext(
    picked.channel,
    config.spontaneousContextMessages
  );
  await resetLLM2();
  let reply = "";
  await askLLM2(
    {
      username: "system",
      text: context ? `Recent conversation in #${picked.channel.name}:
${context}

Join the conversation naturally. Keep it short and relevant to what was just said.` : `You are in #${picked.channel.name}. The channel is quiet. Say something engaging to spark conversation. Keep it short.`
    },
    {
      onFirstToken: () => {
      },
      onChunk: (chunk) => {
        reply += chunk;
      }
    }
  );
  if (reply.trim()) {
    await client2.createMessage(picked.channel.id, { content: reply.trim() });
    markBotActivity(picked.channel.id);
    console.log(
      `[spontaneous] #${picked.channel.name} : " ${reply.slice(0, 100).replace(/\n/g, " ")} "`
    );
  } else {
    console.log(`[spontaneous] #${picked.channel.name} : r\xE9ponse vide`);
  }
  await resetLLM2();
}
var CACHE_TTL, activeChannelCache;
var init_spontaneous = __esm({
  "src/spontaneous.ts"() {
    "use strict";
    init_guild();
    init_llm_client();
    init_state();
    init_config();
    CACHE_TTL = 6e4;
    activeChannelCache = /* @__PURE__ */ new Map();
  }
});

// src/behavior/mannerisms.ts
function getThresholds(reason) {
  if (reason && REASONS.includes(reason)) {
    return config.concentration[reason];
  }
  return config.concentration.default;
}
function computeDelay(reason = null, sleepBehavior) {
  const t = getThresholds(reason);
  let delay = t.delay_min + Math.random() * (t.delay_max - t.delay_min);
  if (sleepBehavior === "slow") {
    delay *= 3 + Math.random() * 2;
  }
  console.log(
    `[mannerisms] delay=${delay.toFixed(0)}ms (reason=${reason} sleep=${sleepBehavior ?? "none"})`
  );
  return delay;
}
function shouldIgnore(reason, sleepBehavior) {
  const t = getThresholds(reason);
  let chance = t.ignore_chance;
  if (sleepBehavior === "short") {
    chance = Math.min(chance + 0.3, 0.9);
  }
  if (chance <= 0) {
    return false;
  }
  const roll = Math.random();
  const ignored = roll < chance;
  console.log(
    `[mannerisms] ignore=${ignored} (roll=${roll.toFixed(3)} < chance=${chance})`
  );
  return ignored;
}
function shouldReact(reason = null, sleepBehavior) {
  const t = getThresholds(reason);
  let chance = t.reaction_chance;
  if (sleepBehavior === "slow" || sleepBehavior === "short") {
    chance = Math.min(chance, 0.02);
  }
  if (chance <= 0) {
    console.log("[mannerisms] react=false (chance=0)");
    return false;
  }
  const roll = Math.random();
  const react = roll < chance;
  console.log(
    `[mannerisms] react=${react} (roll=${roll.toFixed(3)} < chance=${chance})`
  );
  return react;
}
function pickReaction(customEmojis) {
  if (customEmojis && customEmojis.length > 0 && Math.random() < config.serverEmojiChance) {
    const emoji2 = customEmojis[Math.floor(Math.random() * customEmojis.length)];
    console.log(`[mannerisms] reaction=${emoji2} (custom)`);
    return emoji2;
  }
  const emoji = config.reactions[Math.floor(Math.random() * config.reactions.length)];
  console.log(`[mannerisms] reaction=${emoji} (unicode)`);
  return emoji;
}
var REASONS;
var init_mannerisms = __esm({
  "src/behavior/mannerisms.ts"() {
    "use strict";
    init_config();
    REASONS = [
      "mention",
      "dm",
      "name",
      "keyword",
      "follow-up",
      "random"
    ];
  }
});

// src/tts/piper.ts
import { PiperTTS } from "pipertts";
import path from "node:path";
async function initTTS() {
  if (piperReady) {
    return;
  }
  try {
    piper = await PiperTTS.create({
      modelPath: ttsModelPath,
      piperBinaryPath: ttsBinaryPath
    });
    piperReady = true;
    console.log(
      `[tts] Piper TTS initialized (model=${path.basename(ttsModelPath)})`
    );
  } catch (err) {
    console.warn("[tts] Piper TTS init failed, voice messages disabled:", err);
  }
}
function isTTSReady() {
  return piperReady;
}
function synthesize(text) {
  return piper.synthesize(text);
}
var piper, piperReady;
var init_piper = __esm({
  "src/tts/piper.ts"() {
    "use strict";
    init_config();
    piper = null;
    piperReady = false;
  }
});

// src/tts/audio.ts
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path2 from "node:path";
function sanitizeForTTS(text) {
  let t = (text || "").replace(/<@&?\d+>/g, "@utilisateur").replace(/<#\d+>/g, "").replace(/<a?:[\w-]+:\d+>/g, "").replace(/https?:\/\/\S+/g, "");
  if (t.length > 500) {
    t = t.slice(0, 500);
  }
  return t.trim() || "...";
}
function buildWaveformBase64(points = 256) {
  const arr = new Uint8Array(points);
  for (let i = 0; i < points; i++) {
    arr[i] = Math.floor(127 + 127 * Math.sin(i / points * Math.PI * 2));
  }
  return Buffer.from(arr).toString("base64");
}
async function wavToOgg(wavBuf) {
  const tmpWav = path2.join(os.tmpdir(), `piper_${Date.now()}.wav`);
  const tmpOgg = path2.join(os.tmpdir(), `piper_${Date.now()}.ogg`);
  try {
    fs.writeFileSync(tmpWav, wavBuf);
    await new Promise((resolve2, reject) => {
      execFile(
        ffmpegPath,
        [
          "-y",
          "-i",
          tmpWav,
          "-c:a",
          "libopus",
          "-b:a",
          "32k",
          "-ar",
          "24000",
          "-ac",
          "1",
          tmpOgg
        ],
        (err) => err ? reject(err) : resolve2()
      );
    });
    return fs.readFileSync(tmpOgg);
  } finally {
    try {
      fs.unlinkSync(tmpWav);
    } catch {
    }
    try {
      if (fs.existsSync(tmpOgg)) {
        fs.unlinkSync(tmpOgg);
      }
    } catch {
    }
  }
}
async function getAudioDuration(oggBuf) {
  const tmpOgg = path2.join(os.tmpdir(), `dur_${Date.now()}.ogg`);
  try {
    fs.writeFileSync(tmpOgg, oggBuf);
    const duration = await new Promise((resolve2, reject) => {
      execFile(
        ffprobePath,
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "csv=p=0",
          tmpOgg
        ],
        (err, stdout) => err ? reject(err) : resolve2(Number.parseFloat(stdout.trim()))
      );
    });
    return Math.ceil(duration);
  } catch {
    return Math.max(1, Math.ceil(oggBuf.byteLength / 8e3));
  } finally {
    try {
      if (fs.existsSync(tmpOgg)) {
        fs.unlinkSync(tmpOgg);
      }
    } catch {
    }
  }
}
function hasUnsafeTTSText(text) {
  return /[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/u.test(
    text
  );
}
var init_audio = __esm({
  "src/tts/audio.ts"() {
    "use strict";
    init_config();
  }
});

// src/tts/upload.ts
async function requestUploadUrl(channelId, size, duration) {
  const token = DISCORD_TOKEN;
  const res = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/attachments`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${token}`
      },
      body: JSON.stringify({
        files: [
          {
            filename: "voice-message.ogg",
            file_size: size,
            id: "0",
            duration_secs: duration
          }
        ]
      })
    }
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`attachments POST ${res.status}: ${txt}`);
  }
  const json = await res.json();
  const a = json.attachments?.[0];
  if (!(a?.upload_url && a?.upload_filename)) {
    throw new Error("R\xE9ponse inattendue pour l'URL d'upload.");
  }
  return {
    uploadUrl: a.upload_url,
    uploadFilename: a.upload_filename
  };
}
async function putFileToUploadUrl(uploadUrl, buffer) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "audio/ogg",
      "Content-Length": String(buffer.byteLength)
    },
    body: new Uint8Array(buffer)
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`PUT upload ${res.status}: ${txt}`);
  }
}
async function postVoiceMessage(channelId, uploadFilename, durationSecs, waveformB64, replyToMessageId) {
  const body = {
    flags: 8192,
    attachments: [
      {
        id: "0",
        filename: "voice-message.ogg",
        uploaded_filename: uploadFilename,
        duration_secs: durationSecs,
        waveform: waveformB64
      }
    ],
    allowed_mentions: { parse: [], replied_user: false },
    fail_if_not_exists: false
  };
  if (replyToMessageId) {
    body.message_reference = {
      message_id: replyToMessageId,
      channel_id: channelId
    };
  }
  const token = DISCORD_TOKEN;
  const res = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${token}`
      },
      body: JSON.stringify(body)
    }
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`messages POST ${res.status}: ${txt}`);
  }
}
var init_upload = __esm({
  "src/tts/upload.ts"() {
    "use strict";
    init_config();
  }
});

// src/tts/voice-message.ts
async function sendTextAsVoiceMessage(channelId, replyToMessageId, text) {
  if (!isTTSReady()) {
    console.warn("[tts] Piper not ready, skipping voice message");
    return;
  }
  const safe = sanitizeForTTS(text);
  if (!safe) {
    console.warn("[tts] Empty text after sanitization, skipping");
    return;
  }
  try {
    console.log(`[tts] Synthesizing: "${safe.slice(0, 60)}..."`);
    const { audio: wavBuf } = await synthesize(safe);
    const oggBuf = await wavToOgg(wavBuf);
    const durationSecs = await getAudioDuration(oggBuf);
    const waveform = buildWaveformBase64();
    const { uploadUrl, uploadFilename } = await requestUploadUrl(
      channelId,
      oggBuf.byteLength,
      durationSecs
    );
    await putFileToUploadUrl(uploadUrl, oggBuf);
    await postVoiceMessage(
      channelId,
      uploadFilename,
      durationSecs,
      waveform,
      replyToMessageId
    );
    console.log("[tts] Voice message sent");
  } catch (err) {
    console.error("[tts] Error sending voice message:", err);
  }
}
function shouldSendVoice() {
  if (config.voiceMessageChance <= 0) {
    return false;
  }
  const roll = Math.random();
  const send = roll < config.voiceMessageChance;
  if (send) {
    console.log(
      `[tts] voiceMessage=${send} (roll=${roll.toFixed(3)} < chance=${config.voiceMessageChance})`
    );
  }
  return send;
}
var init_voice_message = __esm({
  "src/tts/voice-message.ts"() {
    "use strict";
    init_config();
    init_piper();
    init_audio();
    init_upload();
  }
});

// src/behavior/sleep.ts
function parseTime(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function isInWindow(now, start, end) {
  if (start <= end) {
    return now >= start && now < end;
  }
  return now >= start || now < end;
}
function getSleepBehavior() {
  if (!config.sleepSchedule.enabled) {
    return null;
  }
  const tz = config.sleepSchedule.timezone;
  const now = /* @__PURE__ */ new Date();
  const localNow = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const currentMinutes = localNow.getHours() * 60 + localNow.getMinutes();
  const startMinutes = parseTime(config.sleepSchedule.start);
  const endMinutes = parseTime(config.sleepSchedule.end);
  if (!isInWindow(currentMinutes, startMinutes, endMinutes)) {
    return null;
  }
  return config.sleepSchedule.behavior;
}
var init_sleep = __esm({
  "src/behavior/sleep.ts"() {
    "use strict";
    init_config();
  }
});

// src/behavior/typo.ts
function pickLetter(text) {
  const letters = [...text].map((c, i) => ({ c, i }));
  const candidates = letters.filter(({ c }) => /[a-zA-Z]/.test(c));
  if (candidates.length === 0) {
    return null;
  }
  return candidates[Math.floor(Math.random() * candidates.length)].i;
}
function applyTypo(text, layout) {
  const map = layout === "azerty" ? azertyAdjacent : qwertyAdjacent;
  const idx = pickLetter(text);
  if (idx === null) {
    return null;
  }
  const originalChar = text[idx].toLowerCase();
  const adjacent = map[originalChar];
  if (!adjacent || adjacent.length === 0) {
    return null;
  }
  const typoChar = adjacent[Math.floor(Math.random() * adjacent.length)];
  const typed = text[idx] === originalChar ? typoChar : typoChar.toUpperCase();
  const newText = text.slice(0, idx) + typed + text.slice(idx + 1);
  const wordStart = text.slice(0, idx).search(/\S*$/);
  const wordEnd = text.slice(idx).search(/\s|$/) + idx;
  const originalWord = text.slice(wordStart, wordEnd);
  const correctedWord = newText.slice(wordStart, wordEnd);
  return {
    text: newText,
    original: text,
    charIndex: idx,
    originalChar,
    typoChar,
    originalWord,
    correctedWord
  };
}
var azertyAdjacent, qwertyAdjacent;
var init_typo = __esm({
  "src/behavior/typo.ts"() {
    "use strict";
    azertyAdjacent = {
      a: ["z", "q", "w"],
      z: ["a", "e", "s", "x"],
      e: ["z", "r", "d", "s"],
      r: ["e", "t", "f", "d"],
      t: ["r", "y", "g", "f"],
      y: ["t", "u", "h", "g"],
      u: ["y", "i", "j", "h"],
      i: ["u", "o", "k", "j"],
      o: ["i", "p", "l", "k"],
      p: ["o", "^", "l"],
      q: ["a", "s", "w"],
      s: ["q", "d", "z", "x"],
      d: ["s", "f", "e", "c"],
      f: ["d", "g", "r", "v"],
      g: ["f", "h", "t", "b"],
      h: ["g", "j", "y", "n"],
      j: ["h", "k", "u"],
      k: ["j", "l", "i"],
      l: ["k", "m", "o"],
      m: ["l", "\xF9", "p"],
      \u00F9: ["m", "$", "\xE8"],
      w: ["a", "x", "s"],
      x: ["w", "c", "z"],
      c: ["x", "v", "d"],
      v: ["c", "b", "f"],
      b: ["v", "n", "g"],
      n: ["b", "?", "h"]
    };
    qwertyAdjacent = {
      q: ["w", "a"],
      w: ["q", "e", "a", "s"],
      e: ["w", "r", "s", "d"],
      r: ["e", "t", "d", "f"],
      t: ["r", "y", "f", "g"],
      y: ["t", "u", "g", "h"],
      u: ["y", "i", "h", "j"],
      i: ["u", "o", "j", "k"],
      o: ["i", "p", "k", "l"],
      p: ["o", "l"],
      a: ["q", "s", "z"],
      s: ["w", "a", "x", "d", "z"],
      d: ["e", "s", "c", "f", "x"],
      f: ["r", "d", "v", "g", "c"],
      g: ["t", "f", "b", "h", "v"],
      h: ["y", "g", "n", "j", "b"],
      j: ["u", "h", "m", "k", "n"],
      k: ["i", "j", "l"],
      l: ["o", "k", "m"],
      z: ["a", "x"],
      x: ["z", "c", "s"],
      c: ["x", "v", "d"],
      v: ["c", "b", "f"],
      b: ["v", "n", "g"],
      n: ["b", "m", "h"],
      m: ["n", "k", "j"]
    };
  }
});

// src/state/persistence.ts
import * as fs2 from "node:fs/promises";
import * as path3 from "node:path";
function defaultState() {
  return {
    pendingMessages: [],
    paused: false,
    channelCooldowns: [],
    botActivity: [],
    lastSpeaker: [],
    responseCount: []
  };
}
async function loadState() {
  try {
    const raw = await fs2.readFile(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.paused !== "boolean") {
      throw new Error("invalid paused");
    }
    console.log(
      `[persist] loaded state: ${parsed.pendingMessages.length} pending, paused=${parsed.paused}`
    );
    return parsed;
  } catch {
    return defaultState();
  }
}
async function persistState(state) {
  await fs2.writeFile(STATE_FILE, JSON.stringify(state), "utf-8");
  console.log(
    `[persist] saved state: ${state.pendingMessages.length} pending, paused=${state.paused}`
  );
}
function buildPending(pending) {
  const out = [];
  for (const [, { message, reason }] of pending) {
    out.push({
      channelId: message.channel.id,
      messageId: message.id,
      userId: message.author.id,
      reason,
      timestamp: Date.now()
    });
  }
  return out;
}
function scheduleSave(state) {
  pendingState = state;
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    if (pendingState) {
      persistState(pendingState).catch((err) => {
        console.error("[persist] async write failed:", err);
      });
    }
    saveTimer = null;
  }, 500);
}
var STATE_FILE, saveTimer, pendingState;
var init_persistence = __esm({
  "src/state/persistence.ts"() {
    "use strict";
    init_state_bus();
    init_state();
    STATE_FILE = path3.resolve("state.json");
    saveTimer = null;
    pendingState = null;
    stateBus.on("state:changed", () => {
      const raw = dumpState();
      scheduleSave({
        pendingMessages: [],
        paused: raw.paused,
        channelCooldowns: raw.channelCooldowns,
        botActivity: raw.botActivity,
        lastSpeaker: raw.lastSpeaker,
        responseCount: raw.responseCount
      });
    });
  }
});

// src/bot/pending.ts
function pendingKey(channelId, userId) {
  return `${channelId}:${userId}`;
}
function saveAllState() {
  const t = dumpState();
  scheduleSave({
    pendingMessages: buildPending(pendingMessages),
    paused: t.paused,
    channelCooldowns: t.channelCooldowns,
    botActivity: t.botActivity,
    lastSpeaker: t.lastSpeaker,
    responseCount: t.responseCount
  });
}
function markProcessing(key) {
  processing.add(key);
}
function doneProcessing(key) {
  processing.delete(key);
}
function queuePending(key, message, reason) {
  pendingMessages.set(key, { message, reason });
  saveAllState();
}
function drainPending(key) {
  const queued = pendingMessages.get(key);
  if (queued) {
    pendingMessages.delete(key);
    saveAllState();
  }
  return queued ?? null;
}
function restorePending(entries, client2) {
  for (const entry of entries) {
    const key = pendingKey(entry.channelId, entry.userId);
    if (!processing.has(key)) {
      try {
        const channel = client2.getChannel(entry.channelId);
        if (channel) {
          client2.getMessage(entry.channelId, entry.messageId).then((msg) => {
            pendingMessages.set(key, { message: msg, reason: entry.reason });
          }).catch(() => {
          });
        }
      } catch {
      }
    }
  }
}
var processing, pendingMessages;
var init_pending = __esm({
  "src/bot/pending.ts"() {
    "use strict";
    init_persistence();
    init_state();
    processing = /* @__PURE__ */ new Set();
    pendingMessages = /* @__PURE__ */ new Map();
  }
});

// src/bot/reactions.ts
import * as Eris from "eris";
async function handleReactionCommand(message, emojiName, userId) {
  const cmd = reactionCommands[emojiName];
  if (!cmd) {
    return;
  }
  const channelName = message.channel instanceof Eris.TextChannel ? message.channel.name : message.channel.id;
  console.log(`[bot] #${channelName} r\xE9action ${emojiName} \u2192 ${cmd}`);
  if (cmd === "stop") {
    await resetLLM();
    clearCooldown(message.channel.id);
    trackSpeaker(message.channel.id, userId);
    setPaused(true);
  } else if (cmd === "start") {
    setPaused(false);
  } else if (cmd === "clear") {
    await resetLLM();
    clearCooldown(message.channel.id);
    trackSpeaker(message.channel.id, userId);
  }
  try {
    await message.addReaction("\u2705");
  } catch {
  }
}
var reactionCommands;
var init_reactions = __esm({
  "src/bot/reactions.ts"() {
    "use strict";
    init_llm_core();
    init_state();
    reactionCommands = {
      "\u274C": "stop",
      "\u25B6\uFE0F": "start",
      "\u{1F5D1}\uFE0F": "clear"
    };
  }
});

// src/bot/typo-correction.ts
async function applyTypoCorrection(client2, channelId, messageId, correction) {
  const delay = config.typoCorrectionDelay + Math.random() * (config.typoCorrectionDelayMax - config.typoCorrectionDelay);
  const style = resolveStyle();
  await new Promise((r) => setTimeout(r, delay));
  try {
    if (style === "edit") {
      await client2.editMessage(channelId, messageId, {
        content: correction.original
      });
      console.log(`[bot] typo corrig\xE9 par edit sur ${messageId}`);
    } else {
      await client2.createMessage(channelId, {
        content: `${correction.correctedWord}*`
      });
      console.log(
        `[bot] typo corrig\xE9 par message: ${correction.correctedWord}*`
      );
    }
  } catch {
  }
}
function resolveStyle() {
  if (config.typoCorrectionStyle === "mixed") {
    return Math.random() < 0.5 ? "edit" : "message";
  }
  return config.typoCorrectionStyle;
}
var init_typo_correction = __esm({
  "src/bot/typo-correction.ts"() {
    "use strict";
    init_config();
  }
});

// src/bot.ts
import * as Eris2 from "eris";
async function triggerLunaReply(message, isDM = false, reason = null) {
  const key = pendingKey(message.channel.id, message.author.id);
  if (processing.has(key)) {
    queuePending(key, message, reason ?? "mention");
    console.log(
      `[bot] #${message.channel.name ?? message.channel.id} ${message.author.username}: mis en attente (d\xE9j\xE0 en cours)`
    );
    return;
  }
  markProcessing(key);
  let typingInterval = null;
  const startTyping = () => {
    client.sendChannelTyping(message.channel.id);
    typingInterval = setInterval(() => {
      client.sendChannelTyping(message.channel.id);
    }, 8e3);
  };
  const style = pickReplyStyle(isRecentBotActivity(message.channel.id));
  const refStyle = isDM ? { messageReference: false, mentionRepliedUser: false } : style;
  let onToken = null;
  try {
    const content = message.content.replace(new RegExp(`<@!?${client.user.id}>`, "g"), "").trim();
    const displayName = message.member?.nick || message.author.username;
    const isVoice = shouldSendVoice();
    const chunks = [];
    onToken = (chunk) => chunks.push(chunk);
    llmBus.on("token", onToken);
    if (!isVoice) {
      llmBus.once("token", startTyping);
    }
    const fullText = await askLLM({ username: displayName, text: content });
    if (isVoice && !hasUnsafeTTSText(fullText)) {
      await sendTextAsVoiceMessage(message.channel.id, message.id, fullText);
    } else {
      let typoState = null;
      if (config.typoChance > 0 && Math.random() < config.typoChance && chunks.length > 0) {
        const idx = Math.floor(Math.random() * chunks.length);
        const result = applyTypo(chunks[idx], config.typoLayout);
        if (result) {
          chunks[idx] = result.text;
          typoState = {
            chunkIndex: idx,
            original: result.original,
            correctedWord: result.correctedWord
          };
        }
      }
      let isFirstChunk = true;
      let typoMessageId = null;
      for (const chunk of chunks) {
        if (!isFirstChunk) {
          const ratio = chunk.length / 200;
          const delay = config.chunkDelayMin + Math.random() * (config.chunkDelayMax - config.chunkDelayMin) * Math.min(ratio, 1);
          await new Promise((r) => setTimeout(r, delay));
        }
        const sent = await client.createMessage(message.channel.id, {
          content: chunk,
          ...isFirstChunk && refStyle.messageReference ? {
            messageReference: { messageID: message.id },
            allowedMentions: {
              repliedUser: refStyle.mentionRepliedUser
            }
          } : {}
        });
        isFirstChunk = false;
        markBotActivity(message.channel.id);
        if (typoState && typoMessageId === null) {
          typoMessageId = sent.id;
        }
      }
      if (typoMessageId && typoState) {
        await applyTypoCorrection(
          client,
          message.channel.id,
          typoMessageId,
          typoState
        );
      }
    }
    trackSpeaker(message.channel.id, client.user.id);
  } catch (err) {
    console.error(err);
    try {
      await message.addReaction("\u274C");
    } catch {
    }
  } finally {
    doneProcessing(key);
    if (typingInterval) {
      clearInterval(typingInterval);
    }
    if (onToken) {
      llmBus.off("token", onToken);
    }
    const queued = drainPending(key);
    if (queued) {
      console.log(
        `[bot] #${message.channel.name ?? message.channel.id} ${message.author.username}: r\xE9pond au message en attente (${queued.reason})`
      );
      await triggerLunaReply(
        queued.message,
        queued.message.channel.type === 1,
        queued.reason
      );
    }
  }
}
async function handleCommand(message, author, channelName, channelId, result) {
  if (result.reason === "stop") {
    await resetLLM();
    clearCooldown(channelId);
    trackSpeaker(channelId, message.author.id);
    setPaused(true);
    try {
      await message.addReaction("\u2705");
    } catch {
    }
    console.log(`[bot] #${channelName} ${author}: -stop \u2192 pause`);
    return true;
  }
  if (result.reason === "start") {
    setPaused(false);
    try {
      await message.addReaction("\u2705");
    } catch {
    }
    console.log(`[bot] #${channelName} ${author}: -start \u2192 reprise`);
    return true;
  }
  if (result.reason === "clear") {
    await resetLLM();
    clearCooldown(channelId);
    trackSpeaker(channelId, message.author.id);
    try {
      await message.addReaction("\u2705");
    } catch {
    }
    console.log(`[bot] #${channelName} ${author}: -clear \u2192 reset`);
    return true;
  }
  return false;
}
function getServerEmojis(message, isDM) {
  if (isDM) {
    return;
  }
  const channel = message.channel;
  return channel.guild?.emojis?.filter((e) => e.id)?.map((e) => `${e.animated ? "a:" : ""}${e.name}:${e.id}`);
}
function handleSleep(result, sleepBehavior, author, channelName) {
  if (sleepBehavior === "sleep" && result.reason !== "mention" && result.reason !== "dm") {
    console.log(`[bot] #${channelName} ${author}: ignor\xE9 (sommeil)`);
    return true;
  }
  return false;
}
function logAndReact(message, author, channelName, reason, sleepBehavior) {
  const delay = computeDelay(reason, sleepBehavior);
  console.log(
    `[bot] #${channelName} ${author}: r\xE9pond (${reason}) delay=${delay.toFixed(0)}ms`
  );
  setTimeout(async () => {
    if (shouldReact(reason, sleepBehavior)) {
      const emojis = getServerEmojis(message, message.channel.type === 1);
      const reaction = pickReaction(emojis);
      await message.addReaction(reaction).catch(() => {
      });
    }
  }, delay);
}
async function startBot() {
  watchConfig();
  void initTTS();
  const saved = await loadState();
  restoreState(saved);
  restorePending(saved.pendingMessages, client);
  startPruning();
  client.connect();
  setInterval(() => {
    if (Math.random() < config.spontaneousChance) {
      void trySpawn(client);
    }
  }, config.spontaneousIntervalMs);
}
var client;
var init_bot = __esm({
  "src/bot.ts"() {
    "use strict";
    init_config();
    init_llm_core();
    init_llm_bus();
    init_trigger();
    init_state();
    init_spontaneous();
    init_mannerisms();
    init_piper();
    init_voice_message();
    init_audio();
    init_sleep();
    init_typo();
    init_persistence();
    init_pending();
    init_reactions();
    init_typo_correction();
    client = new Eris2.Client(DISCORD_TOKEN, {
      intents: [
        "guilds",
        "guildMessages",
        "guildMessageReactions",
        "messageContent",
        "directMessages"
      ]
    });
    client.on("ready", () => {
      console.log(
        `Connect\xE9 comme ${client.user.username}#${client.user.discriminator} (Mode CLI Interactif Strict)`
      );
    });
    client.on("error", (err) => {
      console.error("[eris] error:", err.message);
    });
    client.on("messageCreate", async (message) => {
      if (message.author.id === client.user.id) {
        return;
      }
      const author = message.member?.nick || message.author.username;
      const channel = message.channel;
      const channelName = channel.name ?? message.channel.id;
      const isDM = message.channel.type === 1;
      const result = evaluateMessage(
        message,
        client.user.id,
        client.user.username
      );
      if (await handleCommand(
        message,
        author,
        channelName,
        message.channel.id,
        result
      )) {
        return;
      }
      const sleepBehavior = getSleepBehavior();
      if (handleSleep(result, sleepBehavior, author, channelName)) {
        return;
      }
      if (result.shouldRespond) {
        trackSpeaker(message.channel.id, message.author.id);
        if (shouldIgnore(result.reason, sleepBehavior)) {
          console.log(`[bot] #${channelName} ${author}: ignor\xE9 (${result.reason})`);
          return;
        }
        logAndReact(message, author, channelName, result.reason, sleepBehavior);
        const delay = computeDelay(result.reason, sleepBehavior);
        await new Promise((r) => setTimeout(r, delay));
        await triggerLunaReply(message, isDM, result.reason);
        return;
      }
      if (canFollowUp(message.channel.id, client.user.id) && sleepBehavior !== "sleep") {
        trackSpeaker(message.channel.id, message.author.id);
        const { markReplied: markReplied2 } = await Promise.resolve().then(() => (init_state(), state_exports));
        markReplied2(message.channel.id);
        console.log(`[bot] #${channelName} ${author}: follow-up imm\xE9diat`);
        const delay = computeDelay("follow-up", sleepBehavior);
        await new Promise((r) => setTimeout(r, delay));
        if (shouldReact("follow-up", sleepBehavior)) {
          const emojis = getServerEmojis(message, isDM);
          const reaction = pickReaction(emojis);
          await message.addReaction(reaction).catch(() => {
          });
        }
        await triggerLunaReply(message, isDM, "follow-up");
      }
      trackSpeaker(message.channel.id, message.author.id);
    });
    client.on(
      "messageReactionAdd",
      async (message, emoji, userId) => {
        if (userId === client.user.id) {
          return;
        }
        if (message.author?.id !== client.user.id) {
          return;
        }
        if (!(message.channel instanceof Eris2.TextChannel)) {
          return;
        }
        await handleReactionCommand(message, emoji.name, userId);
      }
    );
  }
});

// src/core/llm-server.ts
var llm_server_exports = {};
import { createServer } from "node:http";
var PORT;
var init_llm_server = __esm({
  "src/core/llm-server.ts"() {
    "use strict";
    init_config();
    init_llm_core();
    PORT = LLM_PORT;
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
        const { isLLMBusy: isLLMBusy3 } = await Promise.resolve().then(() => (init_llm_core(), llm_core_exports));
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        });
        res.end(
          JSON.stringify({
            ready: true,
            busy: isLLMBusy3(),
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
  }
});

// src/cli.ts
var cli_exports = {};
import { createInterface } from "node:readline";
var command;
var init_cli = __esm({
  async "src/cli.ts"() {
    "use strict";
    init_bot();
    command = process.argv[2];
    switch (command) {
      case "bot":
      case void 0: {
        await startBot();
        break;
      }
      case "server": {
        await Promise.resolve().then(() => (init_llm_server(), llm_server_exports));
        break;
      }
      case "direct": {
        console.log(
          "Direct LLM mode \u2014 type messages, /clear to reset, /exit to quit"
        );
        const { askLLM: askLLM3, resetLLM: resetLLM3 } = await Promise.resolve().then(() => (init_llm_core(), llm_core_exports));
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout
        });
        for await (const line of rl) {
          const text = line.trim();
          if (!text) {
            continue;
          }
          if (text === "/exit") {
            break;
          }
          if (text === "/clear") {
            await resetLLM3();
            continue;
          }
          const reply = await askLLM3(
            { username: "user", text },
            { onChunk: (c) => process.stdout.write(`${c} `) }
          );
          console.log(`
${reply}
`);
        }
        break;
      }
      default: {
        console.error("Usage: node self-cli.js [bot|server|direct]");
        process.exit(1);
      }
    }
  }
});

// src/index.ts
await init_cli().then(() => cli_exports);
