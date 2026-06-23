import * as Eris from "eris";
import {
	DISCORD_TOKEN,
	pickReplyStyle,
	config,
	watchConfig,
} from "./config.js";
import { askLLM, resetLLM } from "./core/llm-core.js";
import { llmBus } from "./core/llm-bus.js";
import { evaluateMessage, type TriggerResult } from "./state/trigger.js";
import {
	isRecentBotActivity,
	markBotActivity,
	markReplied,
	getGlobalInactivityMs,
	trackSpeaker,
	canFollowUp,
	clearCooldown,
	setPaused,
	restoreState,
	startPruning,
} from "./state/state.js";
import { trySpawn } from "./spontaneous.js";
import {
	computeDelay,
	shouldIgnore,
	shouldReact,
	pickReaction,
} from "./behavior/mannerisms.js";
import type { SleepBehavior } from "./behavior/sleep.js";
import { initTTS } from "./tts/piper.js";
import {
	sendTextAsVoiceMessage,
	shouldSendVoice,
} from "./tts/voice-message.js";
import { hasUnsafeTTSText } from "./tts/audio.js";
import { getSleepBehavior } from "./behavior/sleep.js";
import { applyTypo, type TypoResult } from "./behavior/typo.js";
import { loadState } from "./state/persistence.js";
import {
	recordMessage,
	getFatigueMultiplier,
	getFatigueIgnoreBonus,
	restoreTopicFatigue,
	pruneTopicFatigue,
} from "./state/topic-fatigue.js";
import {
	processing,
	pendingKey,
	queuePending,
	markProcessing,
	doneProcessing,
	drainPending,
	restorePending,
} from "./bot/pending.js";
import { handleReactionCommand } from "./bot/reactions.js";

const sessionCounts = new Map<string, number>();
const sessionPaused = new Set<string>();
const sessionLastMessage = new Map<string, number>();
const sessionQueue = new Map<
	string,
	{ message: Eris.Message; isDM: boolean; reason: string }[]
>();

function drainSessionQueue(channelId: string): void {
	const queued = sessionQueue.get(channelId);
	if (!queued || queued.length === 0) {
		return;
	}
	sessionQueue.delete(channelId);
	const next = queued.shift()!;
	if (queued.length > 0) {
		sessionQueue.set(channelId, queued);
	}
	console.log(
		`[bot] session queue: reprise du message en attente dans #${channelId}`
	);
	void triggerLunaReply(next.message, next.isDM, next.reason).then(() => {
		if (!sessionPaused.has(channelId)) {
			drainSessionQueue(channelId);
		}
	});
}

// --- Session limit (after replying) ---
function checkSessionLimit(
	channelId: string,
	callback: (channelId: string) => void
): void {
	const count = (sessionCounts.get(channelId) ?? 0) + 1;
	sessionCounts.set(channelId, count);
	if (count >= config.sessionMessageLimit) {
		sessionPaused.add(channelId);
		console.log(
			`[bot] session limit atteinte (${count}), pause ${config.sessionPauseSeconds}s`
		);
		setTimeout(() => {
			sessionPaused.delete(channelId);
			sessionCounts.delete(channelId);
			callback(channelId);
			console.log("[bot] session reprise, contexte vidé");
			drainSessionQueue(channelId);
		}, config.sessionPauseSeconds * 1000);
	}
}

const client = new Eris.Client(DISCORD_TOKEN, {
	intents: [
		"guilds",
		"guildMessages",
		"guildMessageReactions",
		"messageContent",
		"directMessages",
	],
});

const typingIntervals = new Map<string, ReturnType<typeof setInterval>>();

let mentionRe: RegExp | null = null;

function getMentionRe(): RegExp {
	if (!mentionRe) {
		mentionRe = new RegExp(`<@!?${client.user.id}>`, "g");
	}
	return mentionRe;
}

function clearTypingInterval(channelId: string): void {
	const existing = typingIntervals.get(channelId);
	if (existing) {
		clearInterval(existing);
		typingIntervals.delete(channelId);
	}
}

async function triggerLunaReply(
	message: Eris.Message,
	isDM = false,
	reason: string | null = null
): Promise<void> {
	const key = pendingKey(message.channel.id, message.author.id);

	if (processing.has(key)) {
		queuePending(key, message, reason ?? "mention");
		console.log(
			`[bot] #${(message.channel as Eris.GuildTextableChannel).name ?? message.channel.id} ${message.author.username}: mis en attente (déjà en cours)`
		);
		return;
	}

	markProcessing(key);

	const startTyping = () => {
		console.log("[bot] startTyping appelé");
		clearTypingInterval(message.channel.id);
		client.sendChannelTyping(message.channel.id);
		typingIntervals.set(
			message.channel.id,
			setInterval(() => {
				client.sendChannelTyping(message.channel.id);
			}, 8000)
		);
	};

	const style = pickReplyStyle(isRecentBotActivity(message.channel.id));
	const refStyle = isDM
		? { messageReference: false, mentionRepliedUser: false }
		: style;

	let onToken: ((chunk: string) => void) | null = null;

	try {
		const content = message.content.replace(getMentionRe(), "").trim();

		const displayName =
			(message.member as Eris.Member | null)?.nick || message.author.username;

		const isVoice = shouldSendVoice();
		const chunks: string[] = [];
		let messageBuffer = "";
		let isFirstChunk = true;

		const willBurst = !isVoice && Math.random() < config.burstChance;

		function stripLlmPrefix(text: string): string {
			return text.replace(/^[^:]+:\s*/, "");
		}

		function sendFragments(
			parts: string[],
			hasRef: boolean
		): Promise<string | null> {
			let accDelay = 0;
			let firstPromise: Promise<string | null> | null = null;
			for (let i = 0; i < parts.length; i++) {
				const frag = stripLlmPrefix(parts[i]);
				if (!frag) {
					continue;
				}
				if (i === 0) {
					const content = hesitationWord ? `${hesitationWord} ${frag}` : frag;
					hesitationWord = "";
					firstPromise = client
						.createMessage(message.channel.id, {
							content,
							...(hasRef && refStyle.messageReference
								? {
										messageReference: { messageID: message.id },
										allowedMentions: {
											repliedUser: refStyle.mentionRepliedUser,
										},
									}
								: {}),
						})
						.then((_sent) => {
							isFirstChunk = false;
							markBotActivity(message.channel.id);
							return _sent.id;
						})
						.catch(() => null);
				} else {
					const delay =
						config.burstDelayMin +
						Math.random() * (config.burstDelayMax - config.burstDelayMin);
					accDelay += delay;
					const fragContent = hesitationWord
						? `${hesitationWord} ${frag}`
						: frag;
					hesitationWord = "";
					setTimeout(() => {
						client
							.createMessage(message.channel.id, { content: fragContent })
							.then(() => markBotActivity(message.channel.id))
							.catch(() => {});
					}, accDelay);
				}
			}
			return firstPromise ?? Promise.resolve(null);
		}

		function splitBurst(text: string): string[] {
			if (!willBurst) {
				return [text];
			}
			const words = text.split(/\s+/);
			if (words.length < 4) {
				return [text];
			}
			const nFrags = Math.random() < 0.6 ? 2 : 3;
			if (nFrags === 2) {
				const splitAt = Math.floor(words.length * (0.3 + Math.random() * 0.25));
				return [
					words.slice(0, splitAt).join(" "),
					words.slice(splitAt).join(" "),
				];
			}
			const split1 = Math.floor(words.length * (0.2 + Math.random() * 0.15));
			const split2 = Math.floor(words.length * (0.55 + Math.random() * 0.15));
			return [
				words.slice(0, split1).join(" "),
				words.slice(split1, split2).join(" "),
				words.slice(split2).join(" "),
			];
		}

		onToken = (word: string) => {
			chunks.push(word);
			if (messageBuffer) {
				messageBuffer += " ";
			}
			messageBuffer += word;
		};
		llmBus.on("token", onToken);

		const hasHesitation = Math.random() < config.hesitationChance;
		let hesitationWord = "";
		if (hasHesitation) {
			hesitationWord =
				config.hesitationWords[
					Math.floor(Math.random() * config.hesitationWords.length)
				];
		}

		startTyping();

		const fullText = await askLLM({
			username: displayName,
			text: content,
			sessionId: message.channel.id,
		});

		// build the text to send (with optional typo)
		const text = stripLlmPrefix(fullText);
		let textToSend = text;
		let typoResult: TypoResult | null = null;

		if (!isVoice && chunks.length > 0 && Math.random() < config.typoChance) {
			const idx = Math.floor(Math.random() * chunks.length);
			const result = applyTypo(chunks[idx], config.typoLayout);
			if (result && text.includes(result.originalWord)) {
				typoResult = result;
				textToSend = text.replace(result.originalWord, result.correctedWord);
				console.log(
					`[bot] typo: "${result.originalWord}" → "${result.correctedWord}"`
				);
			}
		}

		// send the text (with or without typo)
		const willEdit =
			typoResult &&
			(config.typoCorrectionStyle === "edit" ||
				(config.typoCorrectionStyle === "mixed" && Math.random() < 0.5));

		let firstMessageId: string | null = null;
		if (!isVoice) {
			const parts = splitBurst(textToSend);
			firstMessageId = await sendFragments(parts, isFirstChunk);
		}

		// voice TTS (always use clean text)
		if (isVoice && !hasUnsafeTTSText(text)) {
			await sendTextAsVoiceMessage(message.channel.id, message.id, text);
		}

		// typo: correct after delay
		if (typoResult && firstMessageId) {
			const delay =
				config.typoCorrectionDelay +
				Math.random() *
					(config.typoCorrectionDelayMax - config.typoCorrectionDelay);
			await new Promise((r) => setTimeout(r, delay));

			if (willEdit) {
				await client.editMessage(message.channel.id, firstMessageId, {
					content: text,
				});
				console.log(
					`[bot] typo corrigé par edit: "${typoResult.correctedWord}" → "${typoResult.originalWord}"`
				);
			} else {
				await client.createMessage(message.channel.id, {
					content: `${typoResult.originalWord}*`,
				});
				console.log(
					`[bot] typo corrigé par message: "${typoResult.originalWord}*"`
				);
			}
		}

		trackSpeaker(message.channel.id, client.user.id);
	} catch (err) {
		console.error(err);
		try {
			await message.addReaction("❌");
		} catch {
			/* ignore */
		}
	} finally {
		doneProcessing(key);
		clearTypingInterval(message.channel.id);
		if (onToken) {
			llmBus.off("token", onToken);
		}

		const queued = drainPending(key);
		if (queued) {
			console.log(
				`[bot] #${(message.channel as Eris.GuildTextableChannel).name ?? message.channel.id} ${message.author.username}: répond au message en attente (${queued.reason})`
			);
			await triggerLunaReply(
				queued.message,
				!queued.message.guildID,
				queued.reason
			);
		}
	}
}

async function handleCommand(
	message: Eris.Message,
	author: string,
	channelName: string,
	channelId: string,
	result: TriggerResult
): Promise<boolean> {
	if (result.reason === "stop") {
		await resetLLM(channelId);
		clearCooldown(channelId);
		trackSpeaker(channelId, message.author.id);
		setPaused(true);
		try {
			await message.addReaction("✅");
		} catch {
			/* ignore */
		}
		console.log(`[bot] #${channelName} ${author}: -stop → pause`);
		return true;
	}

	if (result.reason === "start") {
		setPaused(false);
		try {
			await message.addReaction("✅");
		} catch {
			/* ignore */
		}
		console.log(`[bot] #${channelName} ${author}: -start → reprise`);
		return true;
	}

	if (result.reason === "clear") {
		await resetLLM(channelId);
		clearCooldown(channelId);
		trackSpeaker(channelId, message.author.id);
		try {
			await message.addReaction("✅");
		} catch {
			/* ignore */
		}
		console.log(`[bot] #${channelName} ${author}: -clear → reset`);
		return true;
	}

	return false;
}

function getServerEmojis(
	message: Eris.Message,
	isDM: boolean
): string[] | undefined {
	if (isDM) {
		return;
	}
	const channel = message.channel as Eris.GuildTextableChannel;
	return channel.guild?.emojis
		?.filter((e) => e.id)
		?.map((e) => `${e.animated ? "a:" : ""}${e.name}:${e.id}`);
}

function handleSleep(
	result: TriggerResult,
	sleepBehavior: SleepBehavior,
	author: string,
	channelName: string
): boolean {
	if (
		sleepBehavior === "sleep" &&
		result.reason !== "mention" &&
		result.reason !== "dm"
	) {
		console.log(`[bot] #${channelName} ${author}: ignoré (sommeil)`);
		return true;
	}
	return false;
}

function logAndReact(
	message: Eris.Message,
	author: string,
	channelName: string,
	reason: string | null,
	delay: number,
	sleepBehavior: SleepBehavior
): void {
	console.log(
		`[bot] #${channelName} ${author}: répond (${reason}) delay=${delay.toFixed(0)}ms`
	);

	setTimeout(async () => {
		if (shouldReact(reason, sleepBehavior)) {
			const emojis = getServerEmojis(message, !message.guildID);
			const reaction = pickReaction(emojis);
			await message.addReaction(reaction).catch(() => {});
		}
	}, delay);
}

let statusIndex = 0;
let lastPresetIndex = -1;
let statusTimeout: ReturnType<typeof setTimeout> | null = null;
let statusTimerActive = false;

function scheduleNextStatus(baseMs: number): void {
	if (statusTimerActive) {
		return;
	}
	statusTimerActive = true;
	const jitter = 0.5 + Math.random() * 1.0;
	const delay = Math.max(60000, baseMs * jitter);
	statusTimeout = setTimeout(() => {
		statusTimerActive = false;
		updateStatus();
	}, delay);
}

function updateStatus(): void {
	const presets = config.dynamicStatus;
	if (presets.length === 0) {
		return;
	}

	const sleep = getSleepBehavior();
	if (sleep === "sleep") {
		client.editStatus("invisible");
		scheduleNextStatus(config.dynamicStatusIntervalMinutes * 60000);
		return;
	}

	if (Math.random() < 0.1) {
		scheduleNextStatus(config.dynamicStatusIntervalMinutes * 60000);
		return;
	}

	let idx: number;
	if (Math.random() < 0.15 && lastPresetIndex >= 0 && presets.length > 1) {
		idx = lastPresetIndex;
	} else {
		idx = statusIndex % presets.length;
		statusIndex++;
	}
	lastPresetIndex = idx;

	const preset = presets[idx];
	client.editStatus(preset.status, [
		{ name: preset.text, type: preset.type as 0 | 1 | 2 | 3 | 4 | 5 },
	]);

	scheduleNextStatus(config.dynamicStatusIntervalMinutes * 60000);
}

function startDynamicStatus(): void {
	if (statusTimeout) {
		clearTimeout(statusTimeout);
		statusTimeout = null;
	}
	statusTimerActive = false;
	updateStatus();
}

client.on("ready", () => {
	console.log(
		`Connecté comme ${client.user.username}#${(client.user as Eris.User).discriminator} (Mode CLI Interactif Strict)`
	);
	if (config.dynamicStatus.length > 0) {
		startDynamicStatus();
	}
});

client.on("error", (err: Error) => {
	console.error("[eris] error:", err.message);
});

client.on("messageCreate", async (message: Eris.Message) => {
	if (message.author.id === client.user.id) {
		return;
	}

	clearTypingInterval(message.channel.id);

	const author = message.member?.nick || message.author.username;
	const channel = message.channel as Eris.GuildTextableChannel;
	const channelName = channel.name ?? message.channel.id;
	const isDM = !message.guildID;

	recordMessage(message.channel.id, message.content);

	const result: TriggerResult = evaluateMessage(
		message,
		client.user.id,
		client.user.username
	);

	if (
		await handleCommand(
			message,
			author,
			channelName,
			message.channel.id,
			result
		)
	) {
		return;
	}

	const sleepBehavior = getSleepBehavior();
	if (handleSleep(result, sleepBehavior, author, channelName)) {
		return;
	}

	const cid = message.channel.id;

	if (sessionPaused.has(cid)) {
		const q = sessionQueue.get(cid) ?? [];
		q.push({ message, isDM, reason: result.reason ?? "mention" });
		sessionQueue.set(cid, q);
		console.log(
			`[bot] #${channelName} ${author}: mis en queue (session pause)`
		);
		return;
	}

	const lastMsg = sessionLastMessage.get(cid);
	if (lastMsg && Date.now() - lastMsg > config.sessionResetMinutes * 60000) {
		sessionCounts.delete(cid);
	}
	sessionLastMessage.set(cid, Date.now());

	if (result.shouldRespond) {
		trackSpeaker(message.channel.id, message.author.id);
		const fatigueIgnoreBonus = getFatigueIgnoreBonus(message.channel.id);
		if (
			!isDM &&
			(shouldIgnore(result.reason, sleepBehavior) ||
				Math.random() < fatigueIgnoreBonus)
		) {
			console.log(
				`[bot] #${channelName} ${author}: ignoré (${result.reason})${fatigueIgnoreBonus > 0 ? ` fatigue=${fatigueIgnoreBonus.toFixed(2)}` : ""}`
			);
			return;
		}

		if (!isDM && Math.random() < config.forgetChance) {
			console.log(`[bot] #${channelName} ${author}: oublié (${result.reason})`);
			return;
		}

		const delay = computeDelay(
			result.reason,
			sleepBehavior,
			message.content.length,
			getGlobalInactivityMs()
		);

		logAndReact(
			message,
			author,
			channelName,
			result.reason,
			delay,
			sleepBehavior
		);

		const fatigueMul = getFatigueMultiplier(message.channel.id);
		const totalDelay = delay * fatigueMul;
		await new Promise((r) => setTimeout(r, totalDelay));
		await triggerLunaReply(message, isDM, result.reason);
		checkSessionLimit(cid, (sid: string) => {
			void resetLLM(sid);
		});
		return;
	}

	if (
		canFollowUp(message.channel.id, client.user.id) &&
		sleepBehavior !== "sleep"
	) {
		trackSpeaker(message.channel.id, message.author.id);
		markReplied(message.channel.id);
		console.log(`[bot] #${channelName} ${author}: follow-up immédiat`);

		const fatigueMul = getFatigueMultiplier(message.channel.id);
		const delay =
			computeDelay(
				"follow-up",
				sleepBehavior,
				message.content.length,
				getGlobalInactivityMs()
			) * fatigueMul;
		await new Promise((r) => setTimeout(r, delay));

		if (shouldReact("follow-up", sleepBehavior)) {
			const emojis = getServerEmojis(message, isDM);
			const reaction = pickReaction(emojis);
			await message.addReaction(reaction).catch(() => {});
		}

		await triggerLunaReply(message, isDM, "follow-up");
		checkSessionLimit(cid, (sid: string) => {
			void resetLLM(sid);
		});
	}

	trackSpeaker(message.channel.id, message.author.id);
});

client.on(
	"messageReactionAdd",
	async (
		message: Eris.Message,
		emoji: { name: string; id?: string },
		userId: string
	) => {
		if (userId === client.user.id) {
			return;
		}
		if (message.author?.id !== client.user.id) {
			return;
		}
		if (!(message.channel instanceof Eris.TextChannel)) {
			return;
		}

		await handleReactionCommand(message, emoji.name, userId);
	}
);

export async function startBot(): Promise<void> {
	watchConfig();
	void initTTS();

	const saved = await loadState();
	restoreState(saved);
	restorePending(saved.pendingMessages, client);
	const wordLogs = saved.topicWordLogs ?? { logs: [], lastActivity: [] };
	restoreTopicFatigue(
		Array.isArray(wordLogs)
			? { logs: wordLogs as [string, string[]][], lastActivity: [] }
			: (wordLogs as {
					logs: [string, string[]][];
					lastActivity: [string, number][];
				})
	);
	startPruning();
	setInterval(pruneTopicFatigue, 300_000);

	client.connect();

	setInterval(() => {
		if (Math.random() < config.spontaneousChance) {
			void trySpawn(client);
		}
	}, config.spontaneousIntervalMs);
}
