import { mock } from "bun:test";

/** Complete config mock factory. Must include ALL named exports from config.ts */
export function mockConfig(overrides: Record<string, unknown> = {}): void {
	mock.module("../src/config.js", () => ({
		config: {
			names: ["Luna", "Pixie"],
			keywords: ["hello", "hi", "hey", "help", "question", "ai", "llm", "bot"],
			randomChance: 0.015,
			cooldownSeconds: 0,
			replyInDM: true,
			concentration: {
				mention: {
					delay_min: 0,
					delay_max: 0,
					ignore_chance: 0,
					reaction_chance: 0.08,
				},
				dm: {
					delay_min: 0,
					delay_max: 0,
					ignore_chance: 0,
					reaction_chance: 0.05,
				},
				name: {
					delay_min: 0,
					delay_max: 0,
					ignore_chance: 0.05,
					reaction_chance: 0.06,
				},
				keyword: {
					delay_min: 0,
					delay_max: 0,
					ignore_chance: 0.08,
					reaction_chance: 0.04,
				},
				"follow-up": {
					delay_min: 0,
					delay_max: 0,
					ignore_chance: 0,
					reaction_chance: 0.03,
				},
				random: {
					delay_min: 0,
					delay_max: 0,
					ignore_chance: 0.15,
					reaction_chance: 0.02,
				},
				default: {
					delay_min: 0,
					delay_max: 0,
					ignore_chance: 0.08,
					reaction_chance: 0.06,
				},
			},
			serverEmojiChance: 0.3,
			reactions: ["👀", "😄", "🤔", "👋", "🔥"],
			spontaneousIntervalMs: 300_000,
			spontaneousChance: 0,
			spontaneousContextMessages: 5,
			spontaneousWhitelist: "*",
			typoChance: 0,
			typoLayout: "azerty",
			typoCorrectionDelay: 0,
			typoCorrectionDelayMax: 0,
			typoCorrectionStyle: "mixed",
			hesitationChance: 0,
			hesitationWords: [
				"uh...",
				"um...",
				"well...",
				"i mean...",
				"hmm...",
				"so...",
			],
			forgetChance: 0,
			inactivityWarmupMinutes: 0,
			inactivityWarmupMultiplier: 1,
			voiceMessageChance: 0,
			sessionMessageLimit: 8,
			sessionPauseSeconds: 0,
			sessionResetMinutes: 3,
			timezone: "Europe/Paris",
			timeSchedules: [] as { start: string; end: string; behavior?: string }[],
			dynamicStatus: [] as { status: string; text: string; type: number }[],
			dynamicStatusIntervalMinutes: 15,
			replyStyles: [
				{
					style: { messageReference: true, mentionRepliedUser: false },
					weight: 50,
				},
				{
					style: { messageReference: true, mentionRepliedUser: true },
					weight: 15,
				},
				{
					style: { messageReference: false, mentionRepliedUser: false },
					weight: 30,
				},
				{
					style: { messageReference: false, mentionRepliedUser: true },
					weight: 5,
				},
			],
			...overrides,
		} as Record<string, unknown>,
		ffmpegPath: "/usr/bin/ffmpeg",
		ffprobePath: "/usr/bin/ffprobe",
		DISCORD_TOKEN: "mock_token",
		LLAMA_MODEL_PATH: "models/model.gguf",
		LLM_HOST: "localhost",
		LLM_PORT: 3124,
		LLM_MODE: "proxy",
		SYSTEM_PROMPT: "You are a test bot",
		jinjaTemplate: "template",
		ttsModelPath: "tts/model.onnx",
		ttsBinaryPath: "bin/piper",
		watchConfig() {},
		pickReplyStyle() {
			return { messageReference: true, mentionRepliedUser: false };
		},
	}));
}
