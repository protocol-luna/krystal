// src/bot.ts
import * as Eris from "eris";

// src/config.ts
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
var ROOT = process.cwd();
function loadSystemPrompt() {
  const promptPath = join(ROOT, "prompt.txt");
  try {
    return readFileSync(promptPath, "utf-8").trim();
  } catch {
    console.warn(`prompt.txt introuvable (${promptPath}), fallback sur prompt par d\xE9faut.`);
    return "Your name is Luna. You are playful 21 year old girl";
  }
}
var SYSTEM_PROMPT = loadSystemPrompt();
var rawDiscordToken = process.env.DISCORD_TOKEN;
var DISCORD_TOKEN = rawDiscordToken ?? (() => {
  console.error("DISCORD_TOKEN manquant dans .env");
  process.exit(1);
})();
var LLAMA_CLI_PATH = process.env.LLAMA_CLI_PATH ?? "../llama-b9682/llama-cli";
var LLAMA_MODEL_PATH = process.env.LLAMA_MODEL_PATH ?? join(ROOT, "models", "Discord-Hermes-3-8B.Q3_K_M.gguf");
var names = ["Luna", "Pixie"];
var keywords = [
  "hello",
  "hi",
  "hey",
  "yo",
  "help",
  "question",
  "ai",
  "llm",
  "bot"
];
var randomChance = 0.015;
var cooldownSeconds = 8;
var replyInDM = true;
var responseDelayMin = 800;
var responseDelayMax = 4e3;
var reactionChance = 0.06;
var ignoreChance = 0.08;
var ignoreChanceMention = 0;
var reactions = [
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
];
var spontaneousIntervalMs = 5 * 60 * 1e3;
var spontaneousChance = 0.12;
var spontaneousContextMessages = 5;
var replyStyles = [
  { style: { messageReference: true, mentionRepliedUser: false }, weight: 50 },
  { style: { messageReference: true, mentionRepliedUser: true }, weight: 15 },
  { style: { messageReference: false, mentionRepliedUser: false }, weight: 30 },
  { style: { messageReference: false, mentionRepliedUser: true }, weight: 5 }
];
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
            callbacks.onFirstToken();
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
var channelCooldowns = /* @__PURE__ */ new Map();
var botActivity = /* @__PURE__ */ new Map();
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
function evaluateMessage(message, botId, botUsername, isFollowUp = false) {
  if (message.author.bot) {
    return { shouldRespond: false, reason: null, botName: "" };
  }
  if (message.content === "-clear") {
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
  if (isMentioned) {
    return { shouldRespond: true, reason: "mention", botName };
  }
  if (isDM && replyInDM) {
    return { shouldRespond: true, reason: "dm", botName };
  }
  if (isDM) {
    return { shouldRespond: false, reason: null, botName };
  }
  if (isOnCooldown(message.channel.id) && !isMentioned && !isFollowUp) {
    return { shouldRespond: false, reason: null, botName };
  }
  if (contentLower.includes(botName.toLowerCase())) {
    markReplied(message.channel.id);
    return { shouldRespond: true, reason: "name", botName };
  }
  for (const name of names) {
    if (contentLower.includes(name.toLowerCase())) {
      markReplied(message.channel.id);
      return { shouldRespond: true, reason: "name", botName };
    }
  }
  for (const keyword of keywords) {
    if (contentLower.includes(keyword.toLowerCase())) {
      markReplied(message.channel.id);
      return { shouldRespond: true, reason: "keyword", botName };
    }
  }
  if (isFollowUp) {
    return { shouldRespond: true, reason: "follow-up", botName };
  }
  if (randomChance > 0 && Math.random() < randomChance) {
    markReplied(message.channel.id);
    return { shouldRespond: true, reason: "random", botName };
  }
  return { shouldRespond: false, reason: null, botName };
}
function clearCooldown(channelId) {
  channelCooldowns.delete(channelId);
  botActivity.delete(channelId);
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
function pickRandomGuild(client2) {
  const guilds = [...client2.guilds.values()];
  if (guilds.length === 0) {
    return null;
  }
  return guilds[Math.floor(Math.random() * guilds.length)];
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
  const guild = pickRandomGuild(client2);
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
    console.log(`[spontaneous] \u2192 #${channel.name} : ${reply.slice(0, 80)}`);
  }
  await resetLLM();
}

// src/mannerisms.ts
function computeDelay() {
  return responseDelayMin + Math.random() * (responseDelayMax - responseDelayMin);
}
function shouldIgnore(reason) {
  if (reason === "mention") {
    return Math.random() < ignoreChanceMention;
  }
  return Math.random() < ignoreChance;
}
function shouldReact() {
  return Math.random() < reactionChance;
}
function pickReaction() {
  return reactions[Math.floor(Math.random() * reactions.length)];
}

// src/bot.ts
var client = new Eris.Client(DISCORD_TOKEN, {
  intents: [
    "guilds",
    "guildMessages",
    "messageContent",
    "directMessages"
  ]
});
var followUpTimers = /* @__PURE__ */ new Map();
async function triggerLunaReply(message) {
  let typingInterval = null;
  const startTyping = () => {
    client.sendChannelTyping(message.channel.id);
    typingInterval = setInterval(() => {
      client.sendChannelTyping(message.channel.id);
    }, 8e3);
  };
  const style = pickReplyStyle(isRecentBotActivity(message.channel.id));
  try {
    const content = message.content.replace(new RegExp(`<@!?${client.user.id}>`, "g"), "").trim();
    const displayName = message.member?.nick || message.author.username;
    let sendChain = Promise.resolve();
    await askLLM(
      { username: displayName, text: content },
      {
        onFirstToken: startTyping,
        onChunk: (chunk) => {
          sendChain = sendChain.then(
            () => client.createMessage(message.channel.id, {
              content: chunk,
              ...style.messageReference ? { messageReference: { messageID: message.id }, allowedMentions: { repliedUser: style.mentionRepliedUser } } : {}
            }).then(() => markBotActivity(message.channel.id))
          );
        }
      }
    );
    await sendChain;
  } catch (err) {
    if (typingInterval) {
      clearInterval(typingInterval);
    }
    console.error(err);
    await client.createMessage(message.channel.id, {
      content: `Erreur interne avec le processus llama-cli : ${err.message}`,
      ...style.messageReference ? { messageReference: { messageID: message.id }, allowedMentions: { repliedUser: style.mentionRepliedUser } } : {}
    }).then(() => markBotActivity(message.channel.id));
  }
}
client.on("ready", () => {
  console.log(`Connect\xE9 comme ${client.user.username}#${client.user.discriminator} (Mode CLI Interactif Strict)`);
});
client.on("messageCreate", async (message) => {
  if (followUpTimers.has(message.channel.id)) {
    clearTimeout(followUpTimers.get(message.channel.id));
    followUpTimers.delete(message.channel.id);
  }
  const result = evaluateMessage(
    message,
    client.user.id,
    client.user.username
  );
  if (result.reason === "clear") {
    console.log("Commande -clear re\xE7ue.");
    await resetLLM();
    clearCooldown(message.channel.id);
    await client.createMessage(message.channel.id, "Historique et m\xE9moire effac\xE9s !");
    return;
  }
  if (result.shouldRespond) {
    if (shouldIgnore(result.reason)) {
      return;
    }
    const delay = computeDelay();
    await client.sendChannelTyping(message.channel.id);
    await new Promise((r) => setTimeout(r, delay));
    if (shouldReact()) {
      await message.addReaction(pickReaction()).catch(() => {
      });
    }
    await triggerLunaReply(message);
    return;
  }
  if (isRecentBotActivity(message.channel.id)) {
    const timer = setTimeout(async () => {
      followUpTimers.delete(message.channel.id);
      const followUp = evaluateMessage(message, client.user.id, client.user.username, true);
      if (followUp.shouldRespond) {
        await triggerLunaReply(message);
      }
    }, 4500);
    followUpTimers.set(message.channel.id, timer);
  }
});
function startBot() {
  client.connect();
  setInterval(() => {
    if (Math.random() < spontaneousChance) {
      void trySpawn(client);
    }
  }, spontaneousIntervalMs);
}

// src/index.ts
startBot();
