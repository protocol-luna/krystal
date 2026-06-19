import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { spawn } from "child_process";
import "dotenv/config";
import * as Eris from "eris";

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
  LLAMA_CLI_PATH = "../llama-b9682/llama-cli",
  LLAMA_MODEL_PATH = join(__dirname, "models", "Discord-Hermes-3-8B.Q3_K_M.gguf"),
} = process.env;

if (!DISCORD_TOKEN) {
  console.error("DISCORD_TOKEN manquant dans .env");
  process.exit(1);
}

// --- CLIENT ERIS ---
// Intents nécessaires: Guilds + GuildMessages + MessageContent + DirectMessages
const client = new Eris.Client(DISCORD_TOKEN, {
  intents: [
    "guilds",
    "guildMessages",
    "messageContent",
    "directMessages",
  ],
});

// --- TEMPLATE JINJA CUSTOM POUR MULTI-USER (ChatML) ---
const jinjaTemplate = "{% for message in messages %}{{'<|im_start|>' + message['role']}}{% if message['name'] %}{{' name=' + message['name']}}{% endif %}{{'\\n' + message['content'] + '<|im_end|>\n'}}{% endfor %}{% if add_generation_prompt %}{{'<|im_start|>assistant\\n'}}{% endif %}";

// --- INITIALISATION DU PROCESSUS LLAMA-CLI ---
const llamaArgs = [
  "-m", LLAMA_MODEL_PATH,
  "-t", "4", "-tb", "4",
  "-b", "4096", "-ub", "256",
  "--mlock",
  "-c", "4096",
  "-cnv",
  "--simple-io",

  "--temp", "0.75",
  "--dynatemp-range", "0.15",
  "--top-k", "40",
  "--top-p", "0.95",
  "--min-p", "0.05",

  "--repeat-penalty", "1.12",
  "--repeat-last-n", "256",
  "--presence-penalty", "0.1",

  "-sys", SYSTEM_PROMPT,
  "--chat-template", jinjaTemplate
];

console.log(`Lancement du CLI: ${LLAMA_CLI_PATH} ${llamaArgs.join(" ")}`);
const llama = spawn(LLAMA_CLI_PATH, llamaArgs);

const requestQueue = [];
let isProcessing = false;

let currentCallback = null;
let currentOnFirstToken = null;
let isModelReady = false;
let stdoutBuffer = "";
let currentUsername = "";

const messageWait = new Map();

llama.stdout.on("data", (data) => {
  const str = data.toString();

  if (!isModelReady) {
    if (str.includes("> ") || str.includes("Enter no prompt")) {
      isModelReady = true;
      console.log("-> Le modèle llama.cpp est prêt à recevoir des messages !");
      processQueue();
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

      const userTagRegex = new RegExp(`\\[\\s*User:\\s*.*?\\s*\\]`, "gi");
      cleanResponse = cleanResponse.replace(userTagRegex, "");

      const namePrefixRegex = new RegExp(`^\\s*(Luna|Luna\\s*Bot|${currentUsername})\\s*:\\s*`, "i");
      cleanResponse = cleanResponse.replace(namePrefixRegex, "");

      currentCallback(cleanResponse.trim(), true);
    } else {
      let streamingClean = stdoutBuffer.replace(/\[\s*Prompt:[\s\S]*$/, "");
      currentCallback(streamingClean, false);
    }
  }
});

llama.stderr.on("data", (data) => {
  const msg = data.toString();
  if (msg.toLowerCase().includes("error") || msg.toLowerCase().includes("failed")) {
    process.stderr.write(msg);
  }
});

llama.on("close", (code) => {
  console.error(`Le processus llama-cli s'est arrêté avec le code : ${code}`);
  process.exit(code);
});

async function processQueue() {
  if (isProcessing || requestQueue.length === 0 || !isModelReady) return;
  isProcessing = true;

  const { userMessage, onFirstToken, resolve } = requestQueue.shift();
  stdoutBuffer = "";
  currentUsername = userMessage.username;

  currentOnFirstToken = onFirstToken;
  currentCallback = (text, isDone) => {
    if (isDone) {
      currentCallback = null;
      resolve(text.trim());
      isProcessing = false;
      setTimeout(() => processQueue(), 100);
    }
  };

  llama.stdin.write(`${userMessage.username}: ${userMessage.text}\n`);
}

function askLLM(userMessage, onFirstToken) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ userMessage, onFirstToken, resolve, reject });
    processQueue();
  });
}

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

client.on("ready", () => {
  console.log(`Connecté comme ${client.user.username}#${client.user.discriminator} (Mode CLI Interactif Strict)`);
  if (isModelReady) processQueue();
});

// Eris: pas de sendTyping() sur channel, on passe par client.sendChannelTyping(channelId)
async function triggerLunaReply(message) {
  let typingInterval = null;
  const startTyping = () => {
    client.sendChannelTyping(message.channel.id);
    typingInterval = setInterval(() => {
      client.sendChannelTyping(message.channel.id);
    }, 8000);
  };

  try {
    const content = message.content
      .replace(new RegExp(`<@!?${client.user.id}>`, "g"), "")
      .trim();

    // Eris n'a pas displayName direct: member.nick si en guild, sinon username
    const displayName = message.member?.nick || message.author.username;

    const reply = await askLLM({ username: displayName, text: content }, startTyping);
    if (typingInterval) clearInterval(typingInterval);

	const chunks = splitMessage(reply);
	for (let i = 0; i < chunks.length; i++) {
	  await client.createMessage(message.channel.id, {
		content: chunks[i],
		messageReference: { messageID: message.id },
		allowedMentions: { repliedUser: false /*i === 0*/ },
	  });
	}
  } catch (err) {
    if (typingInterval) clearInterval(typingInterval);
    console.error(err);
    await client.createMessage(message.channel.id, {
      content: `Erreur interne avec le processus llama-cli : ${err.message}`,
      messageReference: { messageID: message.id },
    });
  }
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (messageWait.has(message.channel.id)) {
    clearTimeout(messageWait.get(message.channel.id));
    messageWait.delete(message.channel.id);
  }

  // mentions.has() n'existe pas en Eris -> message.mentions est un array d'objets user
  const isMentioned = message.mentions.some((u) => u.id === client.user.id);
  const isDM = message.channel.type === 1; // 1 = DM en Eris
  const guild = message.channel.guild;
  const botMember = guild?.members?.get(client.user.id);
  const botName = botMember?.nick || client.user.username;
  const hasBotName = message.content.toLowerCase().includes(botName.toLowerCase());
  const hasPixie = message.content.toLowerCase().includes("pixie");
  const isMe = client.user.id === message.author.id;

  if (message.content === "-clear") {
    console.log("Commande -clear reçue.");
    requestQueue.length = 0;
    isProcessing = false;
    currentCallback = null;
    stdoutBuffer = "";
    llama.stdin.write(`/clear\n`);
    await client.createMessage(message.channel.id, "Historique et mémoire effacés !");
    return;
  }

  if (!isMe && (isMentioned || isDM || hasBotName || hasPixie)) {
    await triggerLunaReply(message);
  } else {
    try {
      const messages = await client.getMessages(message.channel.id, { limit: 2 });
      // getMessages renvoie du plus récent au plus ancien
      const currentMsg = messages[0];
      const prevMsg = messages[1];

      if (prevMsg && prevMsg.author.id === client.user.id && currentMsg.author.id === message.author.id) {
        const timer = setTimeout(async () => {
          messageWait.delete(message.channel.id);
          await triggerLunaReply(message);
        }, 4500);

        messageWait.set(message.channel.id, timer);
      }
    } catch (e) {
      console.error("Erreur lors du fetch de l'historique court :", e);
    }
  }
});

client.connect();
