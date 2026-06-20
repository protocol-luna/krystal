import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

const ROOT = process.cwd();

// --- YAML config ---
const configPath = join(ROOT, "config.yml");
const cfg: Record<string, unknown> = existsSync(configPath)
	? (yaml.load(readFileSync(configPath, "utf-8")) as Record<string, unknown>)
	: {};

function v<T>(key: string, fallback: T): T {
	return (cfg[key] as T) ?? fallback;
}

// --- System prompt ---
function loadSystemPrompt(): string {
	const promptPath = join(ROOT, "prompt.txt");
	try {
		return readFileSync(promptPath, "utf-8").trim();
	} catch {
		console.warn(
			`prompt.txt introuvable (${promptPath}), fallback sur prompt par défaut.`
		);
		return "Your name is Luna. You are playful 21 year old girl";
	}
}

export const SYSTEM_PROMPT = loadSystemPrompt();

// --- Env (surcharge YAML) ---
const rawDiscordToken = process.env.DISCORD_TOKEN;
export const DISCORD_TOKEN: string =
	rawDiscordToken ??
	(() => {
		console.error("DISCORD_TOKEN manquant dans .env");
		process.exit(1);
	})();

export const LLAMA_CLI_PATH: string =
	process.env.LLAMA_CLI_PATH ?? "llama/llama-cli";

export const LLAMA_MODEL_PATH: string =
	process.env.LLAMA_MODEL_PATH ??
	join(ROOT, "models", "Discord-Hermes-3-8B.Q2_K.gguf");

export const PORT: string = process.env.PORT ?? "3124";

export const jinjaTemplate =
	"{% for message in messages %}{{'<|im_start|>' + message['role']}}{% if message['name'] %}{{' name=' + message['name']}}{% endif %}{{'\\n' + message['content'] + '<|im_end|>\n'}}{% endfor %}{% if add_generation_prompt %}{{'<|im_start|>assistant\\n'}}{% endif %}";

// --- Triggers ---
export const names: string[] = v<string[]>("names", ["Luna", "Pixie"]);
export const keywords: string[] = v<string[]>("keywords", [
	"hello",
	"hi",
	"hey",
	"yo",
	"help",
	"question",
	"ai",
	"llm",
	"bot",
]);
export const randomChance = v<number>("random_chance", 0.015);
export const cooldownSeconds = v<number>("cooldown_seconds", 8);
export const replyInDM = v<boolean>("reply_in_dm", true);

// --- Mannerisms ---
export const responseDelayMin = v<number>("response_delay_min", 800);
export const responseDelayMax = v<number>("response_delay_max", 4000);
export const reactionChance = v<number>("reaction_chance", 0.06);
export const ignoreChance = v<number>("ignore_chance", 0.08);
export const ignoreChanceMention = v<number>("ignore_chance_mention", 0);
export const serverEmojiChance = v<number>("server_emoji_chance", 0.3);
export const reactions: string[] = v<string[]>("reactions", [
	"👀",
	"😄",
	"🤔",
	"👋",
	"🔥",
	"💀",
	"✨",
	"😭",
	"🤨",
	"👌",
	"🙏",
	"💅",
	"🗿",
	"🌚",
]);

// --- Spontaneous ---
export const spontaneousIntervalMs = v<number>(
	"spontaneous_interval_ms",
	300_000
);
export const spontaneousChance = v<number>("spontaneous_chance", 0.12);
export const spontaneousContextMessages = v<number>(
	"spontaneous_context_messages",
	5
);
export const spontaneousWhitelist = v<string>(
	"spontaneous_whitelist",
	"*"
);

// --- Typos ---
export const typoChance = v<number>("typo_chance", 0.06);
export const typoCorrectionDelay = v<number>("typo_correction_delay_min", 2000);
export const typoCorrectionDelayMax = v<number>("typo_correction_delay_max", 4000);
export const typoLayout = v<"azerty" | "qwerty">("typo_layout", "azerty");

// --- Chunk delays ---
export const chunkDelayMin = v<number>("chunk_delay_min", 300);
export const chunkDelayMax = v<number>("chunk_delay_max", 1500);

// --- Sleep schedule ---
export interface SleepSchedule {
	enabled: boolean;
	start: string;
	end: string;
	timezone: string;
	behavior: "sleep" | "slow" | "short";
}

const rawSleep = v<Record<string, unknown>>("sleep_schedule", {
	enabled: false,
	start: "23:00",
	end: "08:00",
	timezone: "Europe/Paris",
	behavior: "sleep",
});
export const sleepSchedule: SleepSchedule = {
	enabled: Boolean(rawSleep.enabled),
	start: String(rawSleep.start ?? "23:00"),
	end: String(rawSleep.end ?? "08:00"),
	timezone: String(rawSleep.timezone ?? "Europe/Paris"),
	behavior: (rawSleep.behavior as SleepSchedule["behavior"]) ?? "sleep",
};

// --- TTS / Voice messages ---
export const voiceMessageChance = v<number>("voice_message_chance", 0.08);

export const ttsModelPath: string =
	process.env.TTS_MODEL_PATH ??
	join(ROOT, "tts-engine/en_GB-southern_english_female-low.onnx");

export const ttsBinaryPath: string =
	process.env.TTS_BINARY_PATH ?? join(ROOT, "piper/piper");

// --- Reply style ---
export interface ReplyStyle {
	messageReference: boolean;
	mentionRepliedUser: boolean;
}

interface ReplyStyleEntry {
	message_reference: boolean;
	mention_replied_user: boolean;
	weight: number;
}

const rawStyles = v<ReplyStyleEntry[]>("reply_styles", [
	{ message_reference: true, mention_replied_user: false, weight: 50 },
	{ message_reference: true, mention_replied_user: true, weight: 15 },
	{ message_reference: false, mention_replied_user: false, weight: 30 },
	{ message_reference: false, mention_replied_user: true, weight: 5 },
]);

const replyStyles: { style: ReplyStyle; weight: number }[] = rawStyles.map(
	(s) => ({
		style: {
			messageReference: s.message_reference,
			mentionRepliedUser: s.mention_replied_user,
		},
		weight: s.weight,
	})
);

export function pickReplyStyle(isActiveConversation: boolean): ReplyStyle {
	if (!isActiveConversation) {
		const roll = Math.random();
		if (roll < 0.7) {
			return { messageReference: true, mentionRepliedUser: false };
		}
		if (roll < 0.9) {
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

// --- LLM args ---
import { cpus } from "node:os";

const cpuCount = cpus().length;

export const llamaArgs = [
	"-m", LLAMA_MODEL_PATH,
	"-t", String(cpuCount),
	"-tb", String(cpuCount),
	"-b", "4096",
	"-ub", "256",
	"--mlock","-c",
	"4096", "-cnv",
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