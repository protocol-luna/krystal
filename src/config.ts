import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function loadSystemPrompt(): string {
  const promptPath = join(ROOT, "prompt.txt");
  try {
    return readFileSync(promptPath, "utf-8").trim();
  } catch {
    console.warn(`prompt.txt introuvable (${promptPath}), fallback sur prompt par défaut.`);
    return "Your name is Luna. You are playful 21 year old girl";
  }
}

export const SYSTEM_PROMPT = loadSystemPrompt();

const rawDiscordToken = process.env.DISCORD_TOKEN;
export const DISCORD_TOKEN: string = rawDiscordToken ?? (() => {
  console.error("DISCORD_TOKEN manquant dans .env");
  process.exit(1);
})();

export const LLAMA_CLI_PATH: string = process.env.LLAMA_CLI_PATH ?? "../llama-b9682/llama-cli";

export const LLAMA_MODEL_PATH: string = process.env.LLAMA_MODEL_PATH ?? join(ROOT, "models", "Discord-Hermes-3-8B.Q3_K_M.gguf");

export const jinjaTemplate = "{% for message in messages %}{{'<|im_start|>' + message['role']}}{% if message['name'] %}{{' name=' + message['name']}}{% endif %}{{'\\n' + message['content'] + '<|im_end|>\n'}}{% endfor %}{% if add_generation_prompt %}{{'<|im_start|>assistant\\n'}}{% endif %}";

// --- TRIGGER CONFIG ---
export const names: string[] = ["Luna", "Pixie"];

export const keywords: string[] = [
  "hello", "hi", "hey", "yo",
  "help", "question",
  "ai", "llm", "bot",
];

export const randomChance = 0.015;

export const cooldownSeconds = 8;

export const replyInDM = true;

// --- SPONTANEOUS SPAWN ---
export const spontaneousIntervalMs = 5 * 60 * 1000;
export const spontaneousChance = 0.12;
export const spontaneousContextMessages = 5;

// --- REPLY STYLE ---
export interface ReplyStyle {
  messageReference: boolean;
  mentionRepliedUser: boolean;
}

const replyStyles: { style: ReplyStyle; weight: number }[] = [
  { style: { messageReference: true,  mentionRepliedUser: false }, weight: 50 },
  { style: { messageReference: true,  mentionRepliedUser: true  }, weight: 15 },
  { style: { messageReference: false, mentionRepliedUser: false }, weight: 30 },
  { style: { messageReference: false, mentionRepliedUser: true  }, weight: 5  },
];

export function pickReplyStyle(isActiveConversation: boolean): ReplyStyle {
  if (!isActiveConversation) {
    const roll = Math.random();
    if (roll < 0.70) { return { messageReference: true, mentionRepliedUser: false }; }
    if (roll < 0.90) { return { messageReference: true, mentionRepliedUser: true  }; }
    return { messageReference: false, mentionRepliedUser: false };
  }

  const total = replyStyles.reduce((s, e) => s + e.weight, 0);
  let roll = Math.random() * total;
  for (const entry of replyStyles) {
    roll -= entry.weight;
    if (roll <= 0) { return entry.style; }
  }
  return replyStyles[0].style;
}

export const llamaArgs = [
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
  "--chat-template", jinjaTemplate,
];
