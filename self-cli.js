// src/bot.ts
import * as Eris from "eris";

// src/config.ts
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
var __dirname = dirname(fileURLToPath(import.meta.url));
function loadSystemPrompt() {
  const promptPath = join(__dirname, "prompt.txt");
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
var LLAMA_MODEL_PATH = process.env.LLAMA_MODEL_PATH ?? join(__dirname, "models", "Discord-Hermes-3-8B.Q3_K_M.gguf");
var jinjaTemplate = "{% for message in messages %}{{'<|im_start|>' + message['role']}}{% if message['name'] %}{{' name=' + message['name']}}{% endif %}{{'\\n' + message['content'] + '<|im_end|>\n'}}{% endfor %}{% if add_generation_prompt %}{{'<|im_start|>assistant\\n'}}{% endif %}";
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
var llamaArgs = [
  "-m",
  LLAMA_MODEL_PATH,
  "-t",
  "4",
  "-tb",
  "4",
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

// src/llm.ts
import { spawn } from "node:child_process";
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
  cleaned = cleaned.replace(new RegExp(`^\\s*(Luna|Luna\\s*Bot|${currentUsername})\\s*:\\s*`, "i"), "");
  return cleaned.trim();
}
function cleanFullResponse(text) {
  let cleaned = text;
  cleaned = cleaned.replace(/\[\s*Prompt:[\s\S]*?\]/g, "");
  cleaned = cleaned.replace(/\[\s*User:\s*.*?\s*\]/gi, "");
  cleaned = cleaned.replace(new RegExp(`^\\s*(Luna|Luna\\s*Bot|${currentUsername})\\s*:\\s*`, "im"), "");
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
function resetLLM() {
  requestQueue.length = 0;
  isProcessing = false;
  currentOnChunk = null;
  currentOnDone = null;
  stdoutBuffer = "";
  llama.stdin.write("/clear\n");
}

// src/trigger.ts
var channelCooldowns = /* @__PURE__ */ new Map();
function isOnCooldown(channelId) {
  const last = channelCooldowns.get(channelId);
  if (!last) {
    return false;
  }
  return Date.now() - last < cooldownSeconds * 1e3;
}
function markReplied(channelId) {
  channelCooldowns.set(channelId, Date.now());
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
function isFollowUpMessage(prevMsg, currentMsg, botId) {
  if (!prevMsg) {
    return false;
  }
  return prevMsg.author.id === botId && currentMsg.author.id !== botId;
}
function clearCooldown(channelId) {
  channelCooldowns.delete(channelId);
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
var messageWait = /* @__PURE__ */ new Map();
async function triggerLunaReply(message) {
  let typingInterval = null;
  const startTyping = () => {
    client.sendChannelTyping(message.channel.id);
    typingInterval = setInterval(() => {
      client.sendChannelTyping(message.channel.id);
    }, 8e3);
  };
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
              messageReference: { messageID: message.id },
              allowedMentions: { repliedUser: false }
            })
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
      messageReference: { messageID: message.id }
    });
  }
}
client.on("ready", () => {
  console.log(`Connect\xE9 comme ${client.user.username}#${client.user.discriminator} (Mode CLI Interactif Strict)`);
});
client.on("messageCreate", async (message) => {
  if (messageWait.has(message.channel.id)) {
    clearTimeout(messageWait.get(message.channel.id));
    messageWait.delete(message.channel.id);
  }
  const result = evaluateMessage(
    message,
    client.user.id,
    client.user.username
  );
  if (result.reason === "clear") {
    console.log("Commande -clear re\xE7ue.");
    resetLLM();
    clearCooldown(message.channel.id);
    await client.createMessage(message.channel.id, "Historique et m\xE9moire effac\xE9s !");
    return;
  }
  if (result.shouldRespond) {
    await triggerLunaReply(message);
    return;
  }
  try {
    const messages = await client.getMessages(message.channel.id, { limit: 2 });
    const prevMsg = messages[1];
    if (isFollowUpMessage(prevMsg, message, client.user.id)) {
      const timer = setTimeout(async () => {
        messageWait.delete(message.channel.id);
        const followUp = evaluateMessage(message, client.user.id, client.user.username, true);
        if (followUp.shouldRespond) {
          await triggerLunaReply(message);
        }
      }, 4500);
      messageWait.set(message.channel.id, timer);
    }
  } catch (e) {
    console.error("Erreur lors du fetch de l'historique court :", e);
  }
});
function startBot() {
  client.connect();
}

// src/index.ts
startBot();
