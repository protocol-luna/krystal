import { Client, GatewayIntentBits, Partials } from "discord.js-selfbot-v13";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSystemPrompt() {
  const promptPath = join(__dirname, "prompt.txt");
  try {
    return readFileSync(promptPath, "utf-8").trim();
  } catch {
    console.warn(`prompt.txt introuvable (${promptPath}), fallback sur prompt par défaut.`);
    return "Your name is Luna. You are playful 21 year old girl";
  }
}

const SYSTEM_PROMPT = loadSystemPrompt();

const {
  DISCORD_TOKEN,
  // Mise à jour de l'endpoint par défaut vers l'API native
  LLAMA_API_URL = "http://localhost:8080/completion",
  MAX_TOKENS = "512",
  TEMPERATURE = "0.8",
} = process.env;

if (!DISCORD_TOKEN) {
  console.error("DISCORD_TOKEN manquant dans .env");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// slot llama.cpp assigné à chaque channel, pour garder le cache KV chaud
const channelSlots = new Map(); // channelId -> id_slot
let nextSlot = 0;
const MAX_SLOTS = Number(process.env.LLAMA_PARALLEL_SLOTS || 4);

function getSlotFor(channelId) {
  if (!channelSlots.has(channelId)) {
    channelSlots.set(channelId, nextSlot);
    nextSlot = (nextSlot + 1) % MAX_SLOTS;
  }
  return channelSlots.get(channelId);
}

// historique court par channel (mémoire en RAM, simple)
const history = new Map(); // channelId -> [{role, content}]
const MAX_HISTORY = 10;

function getHistory(channelId) {
  if (!history.has(channelId)) history.set(channelId, []);
  return history.get(channelId);
}

function pushHistory(channelId, role, content) {
  const h = getHistory(channelId);
  h.push({ role, content });
  while (h.length > MAX_HISTORY) h.shift();
}

// onFirstToken: callback appelé une seule fois, dès réception du 1er chunk
async function askLLM(channelId, userMessage, onFirstToken) {
  const h = getHistory(channelId);

  // Formatage ChatML manuel pour garantir la reconnaissance parfaite dans le cache KV
  let promptText = `<|im_start|>system\n${SYSTEM_PROMPT}<|im_end|>\n`;
  for (const msg of h) {
    promptText += `<|im_start|>${msg.role}\n${msg.content}<|im_end|>\n`;
  }
  promptText += `<|im_start|>user\n${userMessage}<|im_end|>\n<|im_start|>assistant\n`;

  const res = await fetch(LLAMA_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: promptText,
      n_predict: Number(MAX_TOKENS),
      temperature: Number(TEMPERATURE),
      stream: true,
      id_slot: getSlotFor(channelId), // garde la même conv sur le même slot KV
      cache_prompt: true,
      stop: ["<|im_end|>", "<|im_start|>"] // Empêche le modèle de parler à ta place
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM API ${res.status}: ${text}`);
  }

  let reply = "";
  let firstTokenFired = false;
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });

    // SSE: events séparés par \n\n, chaque ligne utile commence par "data: "
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // garde la dernière ligne incomplète pour le prochain tour

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;

      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue; // chunk malformé/partiel, on ignore
      }

      // Différence ici : l'API native renvoie directement "content", pas "choices[0].delta"
      const delta = parsed.content;
      if (delta) {
        if (!firstTokenFired) {
          firstTokenFired = true;
          onFirstToken?.();
        }
        reply += delta;
      }
    }
  }

  reply = reply.replace(/^[\r\n\s]+|[\r\n\s]+$/g, '');
  if (!reply) throw new Error("Réponse vide de l'API");

  pushHistory(channelId, "user", userMessage);
  pushHistory(channelId, "assistant", reply);

  return reply;
}

// découpe la réponse en chunks de 2000 chars (limite Discord)
function splitMessage(text, max = 2000) {
  const chunks = [];
  let current = "";
  for (const line of text.split("\n")) {
    if ((current + "\n" + line).length > max) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? current + "\n" + line : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

client.once("clientReady", () => {
  console.log(`Connecté comme ${client.user.tag}`);
  console.log(`LLM endpoint: ${LLAMA_API_URL}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const isMentioned = message.mentions.has(client.user);
  const isDM = message.channel.isDMBased?.() ?? false;

  if (!isMentioned && !isDM) return;

  const content = message.content
    .replace(new RegExp(`<@!?${client.user.id}>`, "g"), "")
    .trim();

  if (!content) return;

  if (content === "-clear") {
    history.delete(message.channel.id);
    const slot = channelSlots.get(message.channel.id);
    if (slot !== undefined) {
      // vide aussi le cache KV côté serveur pour ce slot
      const eraseUrl = new URL(LLAMA_API_URL);
      // Hack propre pour gérer si l'URL est /completion, on repasse à la racine pour /slots
      eraseUrl.pathname = `/slots/${slot}`;
      eraseUrl.search = "action=erase";
      fetch(eraseUrl, { method: "POST" }).catch(() => {});
    }
    await message.reply("Historique effacé.");
    return;
  }

  // pas de sendTyping ici: on attend le 1er token du stream (onFirstToken)
  let typingInterval = null;

  const startTyping = () => {
    message.channel.sendTyping();
    typingInterval = setInterval(() => {
      message.channel.sendTyping();
    }, 8000);
  };

  try {
    const reply = await askLLM(message.channel.id, content, startTyping);
    if (typingInterval) clearInterval(typingInterval);
    const chunks = splitMessage(reply);
    for (const chunk of chunks) {
      await message.reply(chunk);
    }
  } catch (err) {
    if (typingInterval) clearInterval(typingInterval);
    console.error(err);
    await message.reply(
      `Erreur en appelant le LLM (${LLAMA_API_URL}). Vérifie que ton serveur llama.cpp tourne bien. Détail: ${err.message}`
    );
  }
});

client.login(DISCORD_TOKEN);
