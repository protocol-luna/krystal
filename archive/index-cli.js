import { GatewayIntentBits, Partials, ActivityType } from "discord.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { spawn } from "child_process";
import "dotenv/config";
import { Client } from "eris"

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
  //LLAMA_MODEL_PATH = join(__dirname, "models", "Discord-Micae-Hermes-3-3B-Q3_K_M.gguf"),
  LLAMA_MODEL_PATH = join(__dirname, "models", "Discord-Hermes-3-8B.Q3_K_M.gguf"),
  //LLAMA_MODEL_PATH = join(__dirname, "models", "Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf"),
  //LLAMA_MODEL_PATH = join(__dirname, "models", "google_gemma-3-270m-it-Q8_0.gguf"),
} = process.env;

if (!DISCORD_TOKEN) {
  console.error("DISCORD_TOKEN manquant dans .env");
  process.exit(1);
}


/*const client = new Client({
 intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
  ws: { 
    properties: { 
      $browser: "Discord iOS" 
    } 
  }
});
*/
const client = new Client("MTI2Njg4MjgwOTk1NjY2NzUwMw.Gl9UJP.zCqTICX7jD4ZxtxEvtvyPbuQU_SQ-R8mpYKaIY")

// --- TEMPLATE JINJA CUSTOM POUR MULTI-USER (ChatML) ---
// Ce template applique <|im_start|>user name=Pseudo\nMessage<|im_end|>
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
  
  // --- ÉCHANTILLONNAGE AVANCÉ POUR LUNA ---
  "--temp", "0.75",              // Température de base légèrement plus haute
  "--dynatemp-range", "0.15",    // Permet d'osciller dynamiquement entre 0.60 et 0.90
  "--top-k", "40",
  "--top-p", "0.95",
  "--min-p", "0.05",             // Élimine le bruit de fond et stabilise le texte
  
  // --- GESTION DES RÉPÉTITIONS ---
  "--repeat-penalty", "1.12",    // Légèrement augmentée pour éviter les boucles
  "--repeat-last-n", "256",      // Regarde plus loin dans l'historique pour varier son vocabulaire
  "--presence-penalty", "0.1",   // Force l'introduction de nouveaux sujets de discussion
  
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

// Parsing du flux de sortie standard
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
      
      // Nettoyage des résidus de statistiques du binaire
      cleanResponse = cleanResponse.replace(/\[\s*Prompt:[\s\S]*?\]/g, "");
      
      // Sécurité : Supprime un éventuel tag fantôme si le parseur bafouille
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

// Traitement séquentiel de la file d'attente
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

  // Avec notre template Jinja, on passe le nom au tout début de la ligne.
  // Le parseur du mode conversation de llama-cli extrait automatiquement la string avant le ":" 
  // pour la mapper sur la variable 'name' du template de chat !
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

client.once("ready", () => {
  console.log(`Connecté comme ${client.user.tag} (Mode CLI Interactif Strict)`);
  /*
  client.user.setActivity("vos messages", {
    type: ActivityType.Listening
  });*/

  if (isModelReady) processQueue();
});

async function triggerLunaReply(message) {
  let typingInterval = null;
  const startTyping = () => {
    message.channel.sendTyping();
    typingInterval = setInterval(() => {
      message.channel.sendTyping();
    }, 8000);
  };

  try {
    const content = message.content
      .replace(new RegExp(`<@!?${client.user.id}>`, "g"), "")
      .trim();

    const reply = await askLLM({ username: message.author.displayName, text: content }, startTyping);
    if (typingInterval) clearInterval(typingInterval);
    
    const chunks = splitMessage(reply);
    for (const chunk of chunks) {
      await message.reply(chunk);
    }
  } catch (err) {
    if (typingInterval) clearInterval(typingInterval);
    console.error(err);
    await message.reply(`Erreur interne avec le processus llama-cli : ${err.message}`);
  }
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (messageWait.has(message.channel.id)) {
    clearTimeout(messageWait.get(message.channel.id));
    messageWait.delete(message.channel.id);
  }

  const isMentioned = message.mentions.has(client.user);
  const isDM = message.channel.isDMBased?.() ?? false;
  const botName = message.guild?.members?.cache?.get(client.user.id)?.nickname || client.user.username;
  const hasBotName = message.content.toLowerCase().includes(botName.toLowerCase());

  if (message.content === "-clear") {
    console.log("Commande -clear reçue.");
    requestQueue.length = 0;
    isProcessing = false;
    currentCallback = null;
    stdoutBuffer = "";
    llama.stdin.write(`/clear\n`);
    await message.reply("Historique et mémoire effacés !");
    return;
  }

  // Interpellation explicite
  if (isMentioned || isDM || hasBotName) {
    await triggerLunaReply(message);
  } 
  // Relance automatique après 4.5 secondes
  else {
    try {
      const messages = await message.channel.messages.fetch({ limit: 2 });
      const currentMsg = messages.first();
      const prevMsg = messages.last();

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

//client.login(DISCORD_TOKEN);

client.connect(); // Get the bot to connect to Discord
