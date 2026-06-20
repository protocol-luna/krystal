// src/bot.ts
import * as Eris from "eris";

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
var spontaneousWhitelist = v(
  "spontaneous_whitelist",
  "*"
);
var typoChance = v("typo_chance", 0.06);
var typoCorrectionDelay = v("typo_correction_delay_min", 2e3);
var typoCorrectionDelayMax = v("typo_correction_delay_max", 4e3);
var typoLayout = v("typo_layout", "azerty");
var typoCorrectionStyle = v(
  "typo_correction_style",
  "mixed"
);
var chunkDelayMin = v("chunk_delay_min", 300);
var chunkDelayMax = v("chunk_delay_max", 1500);
var rawSleep = v("sleep_schedule", {
  enabled: false,
  start: "23:00",
  end: "08:00",
  timezone: "Europe/Paris",
  behavior: "sleep"
});
var sleepSchedule = {
  enabled: rawSleep.enabled === true,
  start: rawSleep.start ?? "23:00",
  end: rawSleep.end ?? "08:00",
  timezone: rawSleep.timezone ?? "Europe/Paris",
  behavior: rawSleep.behavior ?? "sleep"
};
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
function pickReplyStyle(isActiveConversation) {
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
  const total = replyStyles.reduce((s, e) => s + e.weight, 0);
  let roll = Math.random() * total;
  for (const entry of replyStyles) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.style;
    }
  }
  return replyStyles[0].style;
}
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

// src/llm-client.ts
var LLM_PORT = Number.parseInt(process.env.LLM_PORT ?? "3124", 10);
var BASE = `http://localhost:${LLM_PORT}`;
async function askLLM(userMessage, callbacks) {
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
async function resetLLM() {
  const response = await fetch(`${BASE}/reset`, { method: "POST" });
  if (!response.ok) {
    console.error("LLM reset failed:", response.status);
  }
}
async function isLLMBusy() {
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

// src/trigger.ts
function log(channel, msg) {
  console.log(`[trigger] #${channel} ${msg}`);
}
var channelCooldowns = /* @__PURE__ */ new Map();
var botActivity = /* @__PURE__ */ new Map();
var lastSpeaker = /* @__PURE__ */ new Map();
var responseCount = /* @__PURE__ */ new Map();
var MAX_FOLLOWUPS = 3;
var FOLLOWUP_WINDOW = 6e4;
var paused = false;
function setPaused(v2) {
  paused = v2;
}
function isOnCooldown(channelId) {
  const last = channelCooldowns.get(channelId);
  if (!last) {
    return false;
  }
  return Date.now() - last < cooldownSeconds * 1e3;
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
}
function markBotActivity(channelId) {
  botActivity.set(channelId, Date.now());
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
  lastSpeaker.set(channelId, authorId);
  return previous;
}
function canFollowUp(channelId, botId) {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  const ok = recent && speaker === botId && count < MAX_FOLLOWUPS;
  log(
    channelId,
    `canFollowUp=${ok} (recentBot=${recent} lastSpeaker=${speaker === botId ? "bot" : speaker?.slice(0, 6) ?? "?"} followCount=${count})`
  );
  return ok;
}
function hasWord(text, word) {
  return new RegExp(
    `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`
  ).test(text);
}
function evaluateMessage(message, botId, botUsername, isFollowUp = false) {
  const channelId = message.channel.id;
  if (message.author.bot) {
    log(channelId, `\u201C${message.content.slice(0, 60)}\u201D auteur=bot \u2192 ignore`);
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
    log(channelId, `${author}: \u201C${message.content.slice(0, 60)}\u201D \u2192 mention`);
    setPaused(false);
    return { shouldRespond: true, reason: "mention", botName };
  }
  if (isDM && replyInDM) {
    log(channelId, `${author}: \u201C${message.content.slice(0, 60)}\u201D \u2192 dm`);
    return { shouldRespond: true, reason: "dm", botName };
  }
  if (isDM) {
    log(channelId, `${author}: \u201C${message.content.slice(0, 60)}\u201D \u2192 DM ignor\xE9`);
    return { shouldRespond: false, reason: null, botName };
  }
  if (paused) {
    log(channelId, `${author}: \u201C${message.content.slice(0, 60)}\u201D \u2192 paused`);
    return { shouldRespond: false, reason: null, botName: "" };
  }
  if (isOnCooldown(channelId) && !isMentioned && !isFollowUp) {
    log(channelId, `${author}: \u201C${message.content.slice(0, 60)}\u201D \u2192 cooldown`);
    return { shouldRespond: false, reason: null, botName };
  }
  if (hasWord(contentLower, botName.toLowerCase())) {
    log(
      channelId,
      `${author}: \u201C${message.content.slice(0, 60)}\u201D \u2192 name (bot:${botName})`
    );
    markReplied(channelId);
    return { shouldRespond: true, reason: "name", botName };
  }
  for (const name of names) {
    if (hasWord(contentLower, name.toLowerCase())) {
      log(
        channelId,
        `${author}: \u201C${message.content.slice(0, 60)}\u201D \u2192 name (custom:${name})`
      );
      markReplied(channelId);
      return { shouldRespond: true, reason: "name", botName };
    }
  }
  for (const keyword of keywords) {
    if (hasWord(contentLower, keyword.toLowerCase())) {
      log(
        channelId,
        `${author}: \u201C${message.content.slice(0, 60)}\u201D \u2192 keyword (${keyword})`
      );
      markReplied(channelId);
      return { shouldRespond: true, reason: "keyword", botName };
    }
  }
  if (isFollowUp) {
    log(channelId, `${author}: \u201C${message.content.slice(0, 60)}\u201D \u2192 follow-up`);
    return { shouldRespond: true, reason: "follow-up", botName };
  }
  if (randomChance > 0 && Math.random() < randomChance) {
    log(channelId, `${author}: \u201C${message.content.slice(0, 60)}\u201D \u2192 random`);
    markReplied(channelId);
    return { shouldRespond: true, reason: "random", botName };
  }
  log(channelId, `${author}: \u201C${message.content.slice(0, 60)}\u201D \u2192 rien`);
  return { shouldRespond: false, reason: null, botName };
}
function clearCooldown(channelId) {
  channelCooldowns.delete(channelId);
  botActivity.delete(channelId);
  responseCount.delete(channelId);
  lastSpeaker.delete(channelId);
}

// src/guild.ts
var TEXT_CHANNEL_TYPES = /* @__PURE__ */ new Set([0, 5, 11, 12]);
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

// src/spontaneous.ts
function pickWeightedGuild(client2) {
  const whitelist = spontaneousWhitelist === "*" ? null : new Set(spontaneousWhitelist.split(",").map((id) => id.trim()));
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
    lastID: findMostActiveChannel(g)?.lastMessageID ?? "0"
  })).sort((a, b) => b.lastID.localeCompare(a.lastID));
  const total = ranked.length * (ranked.length + 1) / 2;
  let roll = Math.random() * total;
  for (let i = 0; i < ranked.length; i++) {
    roll -= ranked.length - i;
    if (roll <= 0) {
      return ranked[i].guild;
    }
  }
  return ranked[ranked.length - 1].guild;
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
  if (await isLLMBusy()) {
    return;
  }
  const guild = pickWeightedGuild(client2);
  if (!guild) {
    return;
  }
  const channel = findMostActiveChannel(guild);
  if (!channel) {
    return;
  }
  const context = await fetchContext(channel, spontaneousContextMessages);
  await resetLLM();
  let reply = "";
  await askLLM(
    {
      username: "system",
      text: context ? `Recent conversation in #${channel.name}:
${context}

Join the conversation naturally. Keep it short and relevant to what was just said.` : `You are in #${channel.name}. The channel is quiet. Say something engaging to spark conversation. Keep it short.`
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
    await client2.createMessage(channel.id, { content: reply.trim() });
    markBotActivity(channel.id);
    console.log(
      `[spontaneous] #${channel.name} : " ${reply.slice(0, 100).replace(/\n/g, " ")} "`
    );
  } else {
    console.log(`[spontaneous] #${channel.name} : r\xE9ponse vide`);
  }
  await resetLLM();
}

// src/mannerisms.ts
function pickIgnoreChance(reason) {
  switch (reason) {
    case "mention":
    case "dm":
    case "follow-up":
      return 0;
    case "name":
      return 0.05;
    case "random":
      return 0.15;
    default:
      return ignoreChance;
  }
}
function pickReactionChance(reason) {
  switch (reason) {
    case "mention":
      return 0.08;
    case "dm":
      return 0.05;
    case "name":
      return 0.06;
    case "keyword":
      return 0.04;
    case "follow-up":
      return 0.03;
    case "random":
      return 0.02;
    default:
      return reactionChance;
  }
}
function computeDelay(reason = null, sleepBehavior) {
  let min = responseDelayMin;
  let max = responseDelayMax;
  switch (reason) {
    case "mention":
      min = 300;
      max = 1500;
      break;
    case "dm":
      min = 400;
      max = 1800;
      break;
    case "keyword":
      min = 1e3;
      max = 3500;
      break;
    case "follow-up":
      min = 500;
      max = 2e3;
      break;
    case "random":
      min = 1500;
      max = 5e3;
      break;
    default:
      break;
  }
  let delay = min + Math.random() * (max - min);
  if (sleepBehavior === "slow") {
    delay *= 3 + Math.random() * 2;
  }
  console.log(
    `[mannerisms] delay=${delay.toFixed(0)}ms (reason=${reason} sleep=${sleepBehavior ?? "none"})`
  );
  return delay;
}
function shouldIgnore(reason, sleepBehavior) {
  let chance = pickIgnoreChance(reason);
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
  let chance = pickReactionChance(reason);
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
  if (customEmojis && customEmojis.length > 0 && Math.random() < serverEmojiChance) {
    const emoji2 = customEmojis[Math.floor(Math.random() * customEmojis.length)];
    console.log(`[mannerisms] reaction=${emoji2} (custom)`);
    return emoji2;
  }
  const emoji = reactions[Math.floor(Math.random() * reactions.length)];
  console.log(`[mannerisms] reaction=${emoji} (unicode)`);
  return emoji;
}

// src/tts.ts
import { PiperTTS } from "pipertts";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
var piper = null;
var piperReady = false;
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
function sanitizeForTTS(text) {
  let t = text || "".replace(/<@&?\d+>/g, "@utilisateur").replace(/<#\d+>/g, "").replace(/<a?:[\w-]+:\d+>/g, "").replace(/https?:\/\/\S+/g, "");
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
  const tmpWav = path.join(os.tmpdir(), `piper_${Date.now()}.wav`);
  const tmpOgg = path.join(os.tmpdir(), `piper_${Date.now()}.ogg`);
  try {
    fs.writeFileSync(tmpWav, wavBuf);
    await new Promise((resolve, reject) => {
      execFile(
        path.join(process.cwd(), "bin/ffmpeg"),
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
        (err) => err ? reject(err) : resolve()
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
  const tmpOgg = path.join(os.tmpdir(), `dur_${Date.now()}.ogg`);
  try {
    fs.writeFileSync(tmpOgg, oggBuf);
    const duration = await new Promise((resolve, reject) => {
      execFile(
        path.join(process.cwd(), "bin/ffprobe"),
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "csv=p=0",
          tmpOgg
        ],
        (err, stdout) => err ? reject(err) : resolve(Number.parseFloat(stdout.trim()))
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
async function requestUploadUrl(channelId, size, duration, token) {
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
async function postVoiceMessage(channelId, uploadFilename, durationSecs, waveformB64, token, replyToMessageId) {
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
async function sendTextAsVoiceMessage(channelId, replyToMessageId, text) {
  if (!piperReady) {
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
    const { audio: wavBuf } = await piper.synthesize(safe);
    const oggBuf = await wavToOgg(wavBuf);
    const durationSecs = await getAudioDuration(oggBuf);
    const waveform = buildWaveformBase64();
    const token = DISCORD_TOKEN;
    const { uploadUrl, uploadFilename } = await requestUploadUrl(
      channelId,
      oggBuf.byteLength,
      durationSecs,
      token
    );
    await putFileToUploadUrl(uploadUrl, oggBuf);
    await postVoiceMessage(
      channelId,
      uploadFilename,
      durationSecs,
      waveform,
      token,
      replyToMessageId
    );
    console.log("[tts] Voice message sent");
  } catch (err) {
    console.error("[tts] Error sending voice message:", err);
  }
}
function shouldSendVoice() {
  if (voiceMessageChance <= 0) {
    return false;
  }
  const roll = Math.random();
  const send = roll < voiceMessageChance;
  console.log(
    `[tts] voiceMessage=${send} (roll=${roll.toFixed(3)} < chance=${voiceMessageChance})`
  );
  return send;
}
function hasUnsafeTTSText(text) {
  return /[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/u.test(text);
}

// src/sleep.ts
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
  if (!sleepSchedule.enabled) {
    return null;
  }
  const now = /* @__PURE__ */ new Date();
  const tz = sleepSchedule.timezone;
  const formatter = new Intl.DateTimeFormat("fr-FR", {
    timeZone: tz,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const nowMinutes = hour * 60 + minute;
  const startMinutes = parseTime(sleepSchedule.start);
  const endMinutes = parseTime(sleepSchedule.end);
  if (!isInWindow(nowMinutes, startMinutes, endMinutes)) {
    return null;
  }
  return sleepSchedule.behavior;
}

// src/typo.ts
var azertyAdjacent = {
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
var qwertyAdjacent = {
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
function pickLetter(text) {
  const letters = text.split("").map((c, i) => ({ c, i }));
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
  return { text: newText, original: text, charIndex: idx, originalChar, typoChar, originalWord, correctedWord };
}

// src/bot.ts
var client = new Eris.Client(DISCORD_TOKEN, {
  intents: ["guilds", "guildMessages", "guildMessageReactions", "messageContent", "directMessages"]
});
var processing = /* @__PURE__ */ new Set();
var pendingMessages = /* @__PURE__ */ new Map();
function pendingKey(channelId, userId) {
  return `${channelId}:${userId}`;
}
async function triggerLunaReply(message, isDM = false, reason = null) {
  const key = pendingKey(message.channel.id, message.author.id);
  if (processing.has(key)) {
    pendingMessages.set(key, { message, reason: reason ?? "mention" });
    console.log(
      `[bot] #${message.channel.name ?? message.channel.id} ${message.author.username}: mis en attente (d\xE9j\xE0 en cours)`
    );
    return;
  }
  processing.add(key);
  let typingInterval = null;
  const startTyping = () => {
    client.sendChannelTyping(message.channel.id);
    typingInterval = setInterval(() => {
      client.sendChannelTyping(message.channel.id);
    }, 8e3);
  };
  const style = pickReplyStyle(isRecentBotActivity(message.channel.id));
  const refStyle = isDM ? { messageReference: false, mentionRepliedUser: false } : style;
  console.log(
    `[bot] replyStyle: messageReference=${refStyle.messageReference} mentionRepliedUser=${refStyle.mentionRepliedUser}`
  );
  try {
    const content = message.content.replace(new RegExp(`<@!?${client.user.id}>`, "g"), "").trim();
    const displayName = message.member?.nick || message.author.username;
    const isVoice = shouldSendVoice();
    const chunks = [];
    const fullText = await askLLM(
      { username: displayName, text: content },
      {
        onFirstToken: isVoice ? void 0 : startTyping,
        onChunk: (chunk) => {
          chunks.push(chunk);
        }
      }
    );
    if (isVoice && !hasUnsafeTTSText(fullText)) {
      await sendTextAsVoiceMessage(message.channel.id, message.id, fullText);
    } else {
      let typoIndex = -1;
      let typoOriginal = "";
      let result = null;
      if (typoChance > 0 && Math.random() < typoChance && chunks.length > 0) {
        typoIndex = Math.floor(Math.random() * chunks.length);
        result = applyTypo(chunks[typoIndex], typoLayout);
        if (result) {
          typoOriginal = result.original;
          chunks[typoIndex] = result.text;
        }
      }
      let isFirstChunk = true;
      let typoMessageId = null;
      for (const chunk of chunks) {
        if (!isFirstChunk) {
          const ratio = chunk.length / 200;
          const delay = chunkDelayMin + Math.random() * (chunkDelayMax - chunkDelayMin) * Math.min(ratio, 1);
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
        if (typoOriginal && typoIndex >= 0 && typoMessageId === null) {
          typoMessageId = sent.id;
        }
      }
      if (typoMessageId && typoOriginal) {
        const delay = typoCorrectionDelay + Math.random() * (typoCorrectionDelayMax - typoCorrectionDelay);
        const style2 = typoCorrectionStyle === "mixed" ? Math.random() < 0.5 ? "edit" : "message" : typoCorrectionStyle;
        await (async () => {
          await new Promise((r) => setTimeout(r, delay));
          try {
            if (style2 === "edit") {
              await client.editMessage(message.channel.id, typoMessageId, { content: typoOriginal });
              console.log(`[bot] typo corrig\xE9 par edit sur ${typoMessageId}`);
            } else {
              await client.createMessage(message.channel.id, {
                content: `${result.correctedWord}*`
              });
              console.log(`[bot] typo corrig\xE9 par message: ${result.correctedWord}*`);
            }
          } catch {
          }
        })();
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
    processing.delete(key);
    if (typingInterval) {
      clearInterval(typingInterval);
    }
    const queued = pendingMessages.get(key);
    if (queued) {
      pendingMessages.delete(key);
      console.log(
        `[bot] #${message.channel.name ?? message.channel.id} ${message.author.username}: r\xE9pond au message en attente (${queued.reason})`
      );
      await triggerLunaReply(queued.message, queued.message.channel.type === 1, queued.reason);
    }
  }
}
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
  const isDM = message.channel.type === 1;
  const result = evaluateMessage(
    message,
    client.user.id,
    client.user.username
  );
  if (result.reason === "stop") {
    console.log(
      `[bot] #${channel.name ?? message.channel.id} ${author}: -stop \u2192 pause`
    );
    await resetLLM();
    clearCooldown(message.channel.id);
    trackSpeaker(message.channel.id, message.author.id);
    setPaused(true);
    try {
      await message.addReaction("\u2705");
    } catch {
    }
    return;
  }
  if (result.reason === "start") {
    console.log(
      `[bot] #${channel.name ?? message.channel.id} ${author}: -start \u2192 reprise`
    );
    setPaused(false);
    try {
      await message.addReaction("\u2705");
    } catch {
    }
    return;
  }
  if (result.reason === "clear") {
    console.log(
      `[bot] #${channel.name ?? message.channel.id} ${author}: -clear \u2192 reset`
    );
    await resetLLM();
    clearCooldown(message.channel.id);
    trackSpeaker(message.channel.id, message.author.id);
    try {
      await message.addReaction("\u2705");
    } catch {
    }
    return;
  }
  const sleepBehavior = getSleepBehavior();
  if (sleepBehavior === "sleep" && result.reason !== "mention" && result.reason !== "dm") {
    console.log(
      `[bot] #${channel.name ?? message.channel.id} ${author}: ignor\xE9 (sommeil)`
    );
    return;
  }
  if (result.shouldRespond) {
    trackSpeaker(message.channel.id, message.author.id);
    if (shouldIgnore(result.reason, sleepBehavior)) {
      console.log(
        `[bot] #${channel.name ?? message.channel.id} ${author}: ignor\xE9 (${result.reason})`
      );
      return;
    }
    const delay = computeDelay(result.reason, sleepBehavior);
    console.log(
      `[bot] #${channel.name ?? message.channel.id} ${author}: r\xE9pond (${result.reason}) delay=${delay.toFixed(0)}ms`
    );
    await new Promise((r) => setTimeout(r, delay));
    if (shouldReact(result.reason, sleepBehavior)) {
      const serverEmojis = isDM ? void 0 : channel.guild?.emojis?.filter((e) => e.id)?.map((e) => `${e.animated ? "a:" : ""}${e.name}:${e.id}`);
      const reaction = pickReaction(serverEmojis);
      await message.addReaction(reaction).catch(() => {
      });
    }
    await triggerLunaReply(message, isDM, result.reason);
    return;
  }
  if (canFollowUp(message.channel.id, client.user.id) && sleepBehavior !== "sleep") {
    trackSpeaker(message.channel.id, message.author.id);
    markReplied(message.channel.id);
    console.log(
      `[bot] #${channel.name ?? message.channel.id} ${author}: follow-up imm\xE9diat`
    );
    await new Promise((r) => setTimeout(r, computeDelay("follow-up", sleepBehavior)));
    if (shouldReact("follow-up", sleepBehavior)) {
      const serverEmojis = isDM ? void 0 : channel.guild?.emojis?.filter((e) => e.id)?.map((e) => `${e.animated ? "a:" : ""}${e.name}:${e.id}`);
      const reaction = pickReaction(serverEmojis);
      await message.addReaction(reaction).catch(() => {
      });
    }
    await triggerLunaReply(message, isDM, "follow-up");
  }
  trackSpeaker(message.channel.id, message.author.id);
});
var reactionCommands = {
  "\u274C": "stop",
  "\u25B6\uFE0F": "start",
  "\u{1F5D1}\uFE0F": "clear"
};
client.on("messageReactionAdd", async (message, emoji, userId) => {
  if (userId === client.user.id) {
    return;
  }
  if (message.author.id !== client.user.id) {
    return;
  }
  if (!(message.channel instanceof Eris.TextChannel)) {
    return;
  }
  const cmd = reactionCommands[emoji.name];
  if (!cmd) {
    return;
  }
  console.log(`[bot] #${message.channel.name} r\xE9action ${emoji.name} \u2192 ${cmd}`);
  if (cmd === "stop") {
    await resetLLM();
    clearCooldown(message.channel.id);
    trackSpeaker(message.channel.id, userId);
    setPaused(true);
    try {
      await message.addReaction("\u2705");
    } catch {
    }
  } else if (cmd === "start") {
    setPaused(false);
    try {
      await message.addReaction("\u2705");
    } catch {
    }
  } else if (cmd === "clear") {
    await resetLLM();
    clearCooldown(message.channel.id);
    trackSpeaker(message.channel.id, userId);
    try {
      await message.addReaction("\u2705");
    } catch {
    }
  }
});
function startBot() {
  void initTTS();
  client.connect();
  setInterval(() => {
    if (Math.random() < spontaneousChance) {
      void trySpawn(client);
    }
  }, spontaneousIntervalMs);
}

// src/index.ts
startBot();
