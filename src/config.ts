import { readFileSync, existsSync, watch } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { cpus } from "node:os";

const ROOT = process.cwd();

// --- YAML config (mutable, hot-reloadable) ---
const configPath = join(ROOT, "config.yml");

let rawCfg: Record<string, unknown> = existsSync(configPath)
	? (yaml.load(readFileSync(configPath, "utf-8")) as Record<string, unknown>)
	: {};

function v<T>(key: string, fallback: T): T {
	return (rawCfg[key] as T) ?? fallback;
}

export function watchConfig(): void {
	if (!existsSync(configPath)) {
		return;
	}
	watch(configPath, (event) => {
		if (event !== "change") {
			return;
		}
		try {
			rawCfg = yaml.load(readFileSync(configPath, "utf-8")) as Record<
				string,
				unknown
			>;
			console.log("[config] hot-reloaded config.yml");
		} catch (err) {
			console.error("[config] failed to reload config.yml:", err);
		}
	});
}

// --- Static exports (require restart) ---
export const DISCORD_TOKEN: string =
	v<string | null>("discord_token", null) ??
	process.env.DISCORD_TOKEN ??
	(() => {
		console.error("DISCORD_TOKEN manquant — mets-le dans config.yml ou .env");
		process.exit(1);
	})();

export const LLAMA_CLI_PATH: string =
	v<string | null>("llama_cli_path", null) ??
	process.env.LLAMA_CLI_PATH ??
	"llama/llama-cli";

export const LLAMA_MODEL_PATH: string =
	v<string | null>("llama_model_path", null) ??
	process.env.LLAMA_MODEL_PATH ??
	join(ROOT, "models", "Discord-Hermes-3-8B.Q2_K.gguf");

export const LLM_HOST: string =
	v<string | null>("llm_host", null) ?? process.env.LLM_HOST ?? "localhost";

export const LLM_PORT: number =
	v<number | null>("llm_port", null) ??
	Number.parseInt(process.env.LLM_PORT ?? "3124", 10);

export let LLM_MODE: "cli" | "server" | "proxy" =
	(v<string | null>("llm_mode", null) as "cli" | "server" | "proxy" | null) ??
	(process.env.LLM_MODE as "cli" | "server" | "proxy" | undefined) ??
	"proxy";

/** Override LLM_MODE at runtime (used by llm-server to force cli/server) */
export function setLLMMode(mode: "cli" | "server"): void {
	LLM_MODE = mode;
}

export const SYSTEM_PROMPT = (() => {
	const fromYaml = v<string | null>("system_prompt", null);
	if (fromYaml) {
		return fromYaml;
	}
	const promptPath = join(ROOT, "prompt.txt");
	try {
		return readFileSync(promptPath, "utf-8").trim();
	} catch {
		console.warn(
			"[config] ni system_prompt dans config.yml ni prompt.txt trouvé, fallback sur prompt par défaut."
		);
		return "Your name is Luna. You are playful 21 year old girl";
	}
})();

export const jinjaTemplate =
	"{% for message in messages %}{{'<|im_start|>' + message['role']}}{% if message['name'] %}{{' name=' + message['name']}}{% endif %}{{'\\n' + message['content'] + '<|im_end|>\n'}}{% endfor %}{% if add_generation_prompt %}{{'<|im_start|>assistant\\n'}}{% endif %}";

export const ttsModelPath: string =
	v<string | null>("tts_model_path", null) ??
	process.env.TTS_MODEL_PATH ??
	join(ROOT, "tts-engine/en_GB-southern_english_female-low.onnx");

export const ttsBinaryPath: string =
	v<string | null>("tts_binary_path", null) ??
	process.env.TTS_BINARY_PATH ??
	join(ROOT, "bin/piper/piper");

export const ffmpegPath: string =
	v<string | null>("ffmpeg_path", null) ??
	process.env.FFMPEG_PATH ??
	join(ROOT, "bin/ffmpeg/ffmpeg");

export const ffprobePath: string =
	v<string | null>("ffprobe_path", null) ??
	process.env.FFPROBE_PATH ??
	join(ROOT, "bin/ffmpeg/ffprobe");

const cpuCount = cpus().length;

export const llamaArgs = [
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
	jinjaTemplate,
];

// --- Types (shared by static & reloadable) ---

export interface ConcentrationEntry {
	delay_min: number;
	delay_max: number;
	ignore_chance: number;
	reaction_chance: number;
}

export interface ConcentrationThresholds {
	mention: ConcentrationEntry;
	dm: ConcentrationEntry;
	name: ConcentrationEntry;
	keyword: ConcentrationEntry;
	"follow-up": ConcentrationEntry;
	random: ConcentrationEntry;
	default: ConcentrationEntry;
}

export interface SleepSchedule {
	enabled: boolean;
	start: string;
	end: string;
	timezone: string;
	behavior: "sleep" | "slow" | "short";
}

export interface ReplyStyle {
	messageReference: boolean;
	mentionRepliedUser: boolean;
}

interface ReplyStyleEntry {
	message_reference: boolean;
	mention_replied_user: boolean;
	weight: number;
}

const DEFAULT_CONCENTRATION: ConcentrationThresholds = {
	mention: {
		delay_min: 300,
		delay_max: 1500,
		ignore_chance: 0,
		reaction_chance: 0.08,
	},
	dm: {
		delay_min: 400,
		delay_max: 1800,
		ignore_chance: 0,
		reaction_chance: 0.05,
	},
	name: {
		delay_min: 800,
		delay_max: 4000,
		ignore_chance: 0.05,
		reaction_chance: 0.06,
	},
	keyword: {
		delay_min: 1000,
		delay_max: 3500,
		ignore_chance: 0.08,
		reaction_chance: 0.04,
	},
	"follow-up": {
		delay_min: 500,
		delay_max: 2000,
		ignore_chance: 0,
		reaction_chance: 0.03,
	},
	random: {
		delay_min: 1500,
		delay_max: 5000,
		ignore_chance: 0.15,
		reaction_chance: 0.02,
	},
	default: {
		delay_min: 800,
		delay_max: 4000,
		ignore_chance: 0.08,
		reaction_chance: 0.06,
	},
};

function mergeConcentration(
	raw: Record<string, unknown>,
	defaults: ConcentrationThresholds
): ConcentrationThresholds {
	const merged = { ...defaults };
	for (const key of Object.keys(
		defaults
	) as (keyof ConcentrationThresholds)[]) {
		const entry = raw[key] as Record<string, unknown> | undefined;
		if (entry) {
			merged[key] = {
				delay_min: (entry.delay_min as number) ?? defaults[key].delay_min,
				delay_max: (entry.delay_max as number) ?? defaults[key].delay_max,
				ignore_chance:
					(entry.ignore_chance as number) ?? defaults[key].ignore_chance,
				reaction_chance:
					(entry.reaction_chance as number) ?? defaults[key].reaction_chance,
			};
		}
	}
	return merged;
}

// --- Hot-reloadable config (getters → live values) ---

export const config = {
	get names(): string[] {
		return v<string[]>("names", ["Luna", "Pixie"]);
	},
	get keywords(): string[] {
		return v<string[]>("keywords", [
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
	},
	get randomChance(): number {
		return v<number>("random_chance", 0.015);
	},
	get cooldownSeconds(): number {
		return v<number>("cooldown_seconds", 8);
	},
	get replyInDM(): boolean {
		return v<boolean>("reply_in_dm", true);
	},
	get concentration(): ConcentrationThresholds {
		return mergeConcentration(
			v<Record<string, unknown>>("concentration", {}),
			DEFAULT_CONCENTRATION
		);
	},
	get serverEmojiChance(): number {
		return v<number>("server_emoji_chance", 0.3);
	},
	get reactions(): string[] {
		return v<string[]>("reactions", [
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
	},
	get spontaneousIntervalMs(): number {
		return v<number>("spontaneous_interval_ms", 300_000);
	},
	get spontaneousChance(): number {
		return v<number>("spontaneous_chance", 0.12);
	},
	get spontaneousContextMessages(): number {
		return v<number>("spontaneous_context_messages", 5);
	},
	get spontaneousWhitelist(): string {
		return v<string>("spontaneous_whitelist", "*");
	},
	get typoChance(): number {
		return v<number>("typo_chance", 0.06);
	},
	get typoLayout(): "azerty" | "qwerty" {
		return v<"azerty" | "qwerty">("typo_layout", "azerty");
	},
	get typoCorrectionDelay(): number {
		return v<number>("typo_correction_delay_min", 2000);
	},
	get typoCorrectionDelayMax(): number {
		return v<number>("typo_correction_delay_max", 4000);
	},
	get typoCorrectionStyle(): "edit" | "message" | "mixed" {
		return v<"edit" | "message" | "mixed">("typo_correction_style", "mixed");
	},
	get typingWpm(): number {
		return v<number>("typing_wpm", 300);
	},
	get voiceMessageChance(): number {
		return v<number>("voice_message_chance", 0.08);
	},
	get sleepSchedule(): SleepSchedule {
		const raw = v<Record<string, unknown>>("sleep_schedule", {
			enabled: false,
			start: "23:00",
			end: "08:00",
			timezone: "Europe/Paris",
			behavior: "sleep",
		});
		return {
			enabled: raw.enabled === true,
			start: (raw.start as string) ?? "23:00",
			end: (raw.end as string) ?? "08:00",
			timezone: (raw.timezone as string) ?? "Europe/Paris",
			behavior: (raw.behavior as SleepSchedule["behavior"]) ?? "sleep",
		};
	},
	get replyStyles(): { style: ReplyStyle; weight: number }[] {
		const raw = v<ReplyStyleEntry[]>("reply_styles", [
			{ message_reference: true, mention_replied_user: false, weight: 50 },
			{ message_reference: true, mention_replied_user: true, weight: 15 },
			{ message_reference: false, mention_replied_user: false, weight: 30 },
			{ message_reference: false, mention_replied_user: true, weight: 5 },
		]);
		return raw.map((s) => ({
			style: {
				messageReference: s.message_reference,
				mentionRepliedUser: s.mention_replied_user,
			},
			weight: s.weight,
		}));
	},
};

export function pickReplyStyle(isActiveConversation: boolean): ReplyStyle {
	const styles = config.replyStyles;
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
