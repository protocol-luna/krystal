import yaml from "js-yaml";
import { existsSync, readFileSync, watch } from "node:fs";
import { join } from "node:path";

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
			rebuildCache();
			console.log("[config] hot-reloaded config.yml");
		} catch (err) {
			console.error("[config] failed to reload config.yml:", err);
		}
	});
}

// --- Hot-reload cache ---

let cachedNames: string[] | null = null;
let cachedKeywords: string[] | null = null;
let cachedConcentration: ConcentrationThresholds | null = null;
let cachedReactions: string[] | null = null;
let cachedHesitationWords: string[] | null = null;
let cachedTimeSchedules: TimeScheduleEntry[] | null = null;
let cachedDynamicStatus: DynamicStatusPreset[] | null = null;
let cachedReplyStyles: { style: ReplyStyle; weight: number }[] | null = null;

function rebuildCache(): void {
	cachedNames = null;
	cachedKeywords = null;
	cachedConcentration = null;
	cachedReactions = null;
	cachedHesitationWords = null;
	cachedTimeSchedules = null;
	cachedDynamicStatus = null;
	cachedReplyStyles = null;
}

// --- Static exports (require restart) ---
export const DISCORD_TOKEN: string =
	v<string | null>("discord_token", null) ??
	process.env.DISCORD_TOKEN ??
	(() => {
		console.error("DISCORD_TOKEN manquant -- mets-le dans config.yml ou .env");
		process.exit(1);
	})();

export const LLAMA_MODEL_PATH: string =
	v<string | null>("llama_model_path", null) ??
	process.env.LLAMA_MODEL_PATH ??
	join(ROOT, "models", "Discord-Micae-Hermes-3-3B.Q8_0.gguf");

export const LLM_HOST: string =
	v<string | null>("llm_host", null) ?? process.env.LLM_HOST ?? "localhost";

export const LLM_PORT: number =
	v<number | null>("llm_port", null) ??
	Number.parseInt(process.env.LLM_PORT ?? "3124", 10);

export type LLMMode = "direct" | "online";

export const LLM_MODE: LLMMode =
	(process.env.LLM_MODE as LLMMode | undefined) ?? "direct";

export const LLM_API_ENDPOINT: string =
	v<string | null>("llm_api_endpoint", null) ??
	process.env.LLM_API_ENDPOINT ??
	"";

export const LLM_API_TOKEN: string =
	v<string | null>("llm_api_token", null) ?? process.env.LLM_API_TOKEN ?? "";

export const LLM_SERVER_KEY: string =
	v<string | null>("llm_server_key", null) ?? process.env.LLM_SERVER_KEY ?? "";

export const LLM_MODEL: string =
	v<string | null>("llm_model", null) ?? process.env.LLM_MODEL ?? "gpt-4o-mini";

export const LLM_SESSION_TTL: number =
	v<number | null>("llm_session_ttl", null) ?? 10;

export const LLM_CPU_AFFINITY: string =
	v<string | null>("llm_cpu_affinity", null) ??
	process.env.LLM_CPU_AFFINITY ??
	"0,1";

export const LLM_N_THREADS: number | "auto" =
	v<number | "auto" | null>("llm_n_threads", null) ??
	(process.env.LLM_N_THREADS as number | "auto" | undefined) ??
	"auto";

export const LLM_N_SLOTS: number =
	v<number | null>("llm_n_slots", null) ??
	Number.parseInt(process.env.LLM_N_SLOTS ?? "1", 10);

export const LLM_N_CTX: number =
	v<number | null>("llm_n_ctx", null) ??
	Number.parseInt(process.env.LLM_N_CTX ?? "8192", 10);

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

// --- Few-shot priming configuration ---
export interface FewShotExample {
	user: string;
	assistant: string;
}

export const FEW_SHOT_ENABLED: boolean =
	v<boolean | null>("few_shot_enabled", null) ?? true;

export const FEW_SHOT_EXAMPLES: FewShotExample[] = v<FewShotExample[] | null>(
	"few_shot_examples",
	null
) ?? [
	{ user: "yo whats good", assistant: "nm just chillin, u" },
	{ user: "bored af", assistant: "lol same energy fr" },
	{
		user: "hey how are you",
		assistant: "im doing pretty good tbh, just vibing",
	},
	{ user: "whats up", assistant: "yooo not much, what about you" },
	{
		user: "how was your day",
		assistant: "it was alright, nothing crazy happened lol",
	},
];

export const MIROSTAT_ENABLED: boolean =
	v<boolean | null>("mirostat_enabled", null) ?? true;

export const MIROSTAT_MODE: 1 | 2 =
	(v<number | null>("mirostat_mode", null) as 1 | 2 | null) ?? 2;

export const MIROSTAT_LR: number = v<number | null>("mirostat_lr", null) ?? 0.1;

export const MIROSTAT_ENT: number =
	v<number | null>("mirostat_ent", null) ?? 5.0;

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

export interface TimeScheduleEntry {
	start: string;
	end: string;
	behavior?: "sleep" | "slow" | "short";
}

export type SelfStatus = "online" | "idle" | "dnd" | "invisible";

export interface DynamicStatusPreset {
	status: SelfStatus;
	text: string;
	type: number;
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
		ignore_chance: 0.02,
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
		ignore_chance: 0.02,
		reaction_chance: 0.06,
	},
	keyword: {
		delay_min: 1000,
		delay_max: 3500,
		ignore_chance: 0.02,
		reaction_chance: 0.04,
	},
	"follow-up": {
		delay_min: 500,
		delay_max: 2000,
		ignore_chance: 0.02,
		reaction_chance: 0.03,
	},
	random: {
		delay_min: 1500,
		delay_max: 5000,
		ignore_chance: 0.02,
		reaction_chance: 0.02,
	},
	default: {
		delay_min: 800,
		delay_max: 4000,
		ignore_chance: 0.02,
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
		if (!cachedNames) {
			cachedNames = v<string[]>("names", ["Luna", "Pixie"]);
		}
		return cachedNames;
	},
	get keywords(): string[] {
		if (!cachedKeywords) {
			cachedKeywords = v<string[]>("keywords", [
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
		}
		return cachedKeywords;
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
		if (!cachedConcentration) {
			cachedConcentration = mergeConcentration(
				v<Record<string, unknown>>("concentration", {}),
				DEFAULT_CONCENTRATION
			);
		}
		return cachedConcentration;
	},
	get serverEmojiChance(): number {
		return v<number>("server_emoji_chance", 0.3);
	},
	get reactions(): string[] {
		if (!cachedReactions) {
			cachedReactions = v<string[]>("reactions", [
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
		}
		return cachedReactions;
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
	get burstChance(): number {
		return v<number>("burst_chance", 0.15);
	},
	get burstDelayMin(): number {
		return v<number>("burst_delay_min", 1500);
	},
	get burstDelayMax(): number {
		return v<number>("burst_delay_max", 4000);
	},
	get topicFatigueEnabled(): boolean {
		return v<boolean>("topic_fatigue_enabled", true);
	},
	get topicFatigueWindow(): number {
		return v<number>("topic_fatigue_window", 10);
	},
	get topicFatigueThreshold(): number {
		return v<number>("topic_fatigue_threshold", 3);
	},
	get topicFatigueDelayMultiplier(): number {
		return v<number>("topic_fatigue_delay_multiplier", 2);
	},
	get topicFatigueIgnoreBonus(): number {
		return v<number>("topic_fatigue_ignore_bonus", 0.15);
	},
	get hesitationChance(): number {
		return v<number>("hesitation_chance", 0.15);
	},
	get hesitationWords(): string[] {
		if (!cachedHesitationWords) {
			cachedHesitationWords = v<string[]>("hesitation_words", [
				"uh...",
				"um...",
				"well...",
				"i mean...",
				"hmm...",
				"so...",
			]);
		}
		return cachedHesitationWords;
	},
	get forgetChance(): number {
		return v<number>("forget_chance", 0.03);
	},
	get inactivityWarmupMinutes(): number {
		return v<number>("inactivity_warmup_minutes", 10);
	},
	get inactivityWarmupMultiplier(): number {
		return v<number>("inactivity_warmup_multiplier", 2);
	},
	get voiceMessageChance(): number {
		return v<number>("voice_message_chance", 0.08);
	},
	get timezone(): string {
		return v<string>("timezone", "Europe/Paris");
	},
	get timeSchedules(): TimeScheduleEntry[] {
		if (cachedTimeSchedules) {
			return cachedTimeSchedules;
		}
		const raw = v<unknown[]>("time_schedules", []);
		if (!Array.isArray(raw)) {
			return [];
		}
		cachedTimeSchedules = raw.map((entry) => {
			const e = entry as Record<string, unknown>;
			return {
				start: String(e?.start ?? "00:00"),
				end: String(e?.end ?? "00:00"),
				behavior: ["sleep", "slow", "short"].includes(e?.behavior as string)
					? (e.behavior as "sleep" | "slow" | "short")
					: undefined,
			};
		});
		return cachedTimeSchedules;
	},
	get dynamicStatus(): DynamicStatusPreset[] {
		if (cachedDynamicStatus) {
			return cachedDynamicStatus;
		}
		const raw = v<{ status: string; text: string; type: number }[]>(
			"dynamic_status_presets",
			[]
		);
		cachedDynamicStatus = raw.map((p) => ({
			status: (["online", "idle", "dnd", "invisible"].includes(p.status)
				? p.status
				: "online") as SelfStatus,
			text: p.text,
			type: p.type ?? 0,
		}));
		return cachedDynamicStatus;
	},
	get dynamicStatusIntervalMinutes(): number {
		return v<number>("dynamic_status_interval_minutes", 15);
	},
	get sessionMessageLimit(): number {
		return v<number>("session_message_limit", 8);
	},
	get sessionPauseSeconds(): number {
		return v<number>("session_pause_seconds", 30);
	},
	get sessionResetMinutes(): number {
		return v<number>("session_reset_minutes", 3);
	},
	get replyStyles(): { style: ReplyStyle; weight: number }[] {
		if (cachedReplyStyles) {
			return cachedReplyStyles;
		}
		const raw = v<ReplyStyleEntry[]>("reply_styles", [
			{ message_reference: true, mention_replied_user: false, weight: 50 },
			{ message_reference: true, mention_replied_user: true, weight: 15 },
			{ message_reference: false, mention_replied_user: false, weight: 30 },
			{ message_reference: false, mention_replied_user: true, weight: 5 },
		]);
		cachedReplyStyles = raw.map((s) => ({
			style: {
				messageReference: s.message_reference,
				mentionRepliedUser: s.mention_replied_user,
			},
			weight: s.weight,
		}));
		return cachedReplyStyles;
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
