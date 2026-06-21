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
import { applyTypo } from "./behavior/typo.js";
import { loadState } from "./state/persistence.js";
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
	if (!queued || queued.length === 0) return;
	sessionQueue.delete(channelId);
	const next = queued.shift()!;
	if (queued.length > 0) sessionQueue.set(channelId, queued);
	console.log(
		`[bot] session queue: reprise du message en attente dans #${channelId}`
	);
	void triggerLunaReply(next.message, next.isDM, next.reason).then(() => {
		if (!sessionPaused.has(channelId)) drainSessionQueue(channelId);
	});
}

// --- Session limit (after replying) ---
function checkSessionLimit(channelId: string, callback: () => void): void {
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
			callback();
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

	let typingInterval: ReturnType<typeof setInterval> | null = null;
	const startTyping = () => {
		console.log("[bot] startTyping appelé");
		client.sendChannelTyping(message.channel.id);
		typingInterval = setInterval(() => {
			client.sendChannelTyping(message.channel.id);
		}, 8000);
	};

	const style = pickReplyStyle(isRecentBotActivity(message.channel.id));
	const refStyle = isDM
		? { messageReference: false, mentionRepliedUser: false }
		: style;

	let onToken: ((chunk: string) => void) | null = null;
	let onFlush: (() => void) | null = null;

	try {
		const content = message.content
			.replace(new RegExp(`<@!?${client.user.id}>`, "g"), "")
			.trim();

		const displayName =
			(message.member as Eris.Member | null)?.nick || message.author.username;

		const isVoice = shouldSendVoice();
		const chunks: string[] = [];
		let messageBuffer = "";
		let isFirstChunk = true;

		const willBurst = !isVoice && Math.random() < config.burstChance;

		function sendFragments(parts: string[], hasRef: boolean): void {
			let accDelay = 0;
			for (let i = 0; i < parts.length; i++) {
				const frag = parts[i];
				if (!frag) {
					continue;
				}
				if (i === 0) {
					const content = hesitationWord ? `${hesitationWord} ${frag}` : frag;
					hesitationWord = "";
					client
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
						})
						.catch(() => {});
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

		if (!isVoice) {
			llmBus.once("token", startTyping);
		}

		const hasHesitation = Math.random() < config.hesitationChance;
		let hesitationWord = "";
		if (hasHesitation) {
			hesitationWord =
				config.hesitationWords[
					Math.floor(Math.random() * config.hesitationWords.length)
				];
		}

		if (!isVoice) {
			onFlush = () => {
				if (!messageBuffer) {
					return;
				}
				const parts = splitBurst(messageBuffer);
				messageBuffer = "";
				sendFragments(parts, isFirstChunk);
			};
			llmBus.on("flush", onFlush);
		}

		const fullText = await askLLM({ username: displayName, text: content });

		// flush remaining buffer (last line without newline sentinel)
		if (!isVoice && messageBuffer) {
			const parts = splitBurst(messageBuffer);
			messageBuffer = "";
			sendFragments(parts, isFirstChunk);
		}

		// voice TTS
		if (isVoice && !hasUnsafeTTSText(fullText)) {
			await sendTextAsVoiceMessage(message.channel.id, message.id, fullText);
		}

		// typo correction: sending correction message
		if (!isVoice && chunks.length > 0 && Math.random() < config.typoChance) {
			const idx = Math.floor(Math.random() * chunks.length);
			const result = applyTypo(chunks[idx], config.typoLayout);
			if (result) {
				await client.createMessage(message.channel.id, {
					content: `${result.correctedWord}*`,
				});
				console.log(`[bot] typo corrigé par message: ${result.correctedWord}*`);
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
		if (typingInterval) {
			clearInterval(typingInterval);
		}
		if (onToken) {
			llmBus.off("token", onToken);
		}
		if (onFlush) {
			llmBus.off("flush", onFlush);
		}

		const queued = drainPending(key);
		if (queued) {
			console.log(
				`[bot] #${(message.channel as Eris.GuildTextableChannel).name ?? message.channel.id} ${message.author.username}: répond au message en attente (${queued.reason})`
			);
			await triggerLunaReply(
				queued.message,
				queued.message.channel.type === 1,
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
		await resetLLM();
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
		await resetLLM();
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
	sleepBehavior: SleepBehavior
): void {
	const delay = computeDelay(
		reason,
		sleepBehavior,
		message.content.length,
		getGlobalInactivityMs()
	);
	console.log(
		`[bot] #${channelName} ${author}: répond (${reason}) delay=${delay.toFixed(0)}ms`
	);

	setTimeout(async () => {
		if (shouldReact(reason, sleepBehavior)) {
			const emojis = getServerEmojis(message, message.channel.type === 1);
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

	const author = message.member?.nick || message.author.username;
	const channel = message.channel as Eris.GuildTextableChannel;
	const channelName = channel.name ?? message.channel.id;
	const isDM = message.channel.type === 1;

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
		if (shouldIgnore(result.reason, sleepBehavior)) {
			console.log(`[bot] #${channelName} ${author}: ignoré (${result.reason})`);
			return;
		}

		if (Math.random() < config.forgetChance) {
			console.log(`[bot] #${channelName} ${author}: oublié (${result.reason})`);
			return;
		}

		logAndReact(message, author, channelName, result.reason, sleepBehavior);

		const delay = computeDelay(
			result.reason,
			sleepBehavior,
			message.content.length,
			getGlobalInactivityMs()
		);
		await new Promise((r) => setTimeout(r, delay));
		await triggerLunaReply(message, isDM, result.reason);
		checkSessionLimit(cid, () => {
			void resetLLM();
		});
		return;
	}

	if (
		canFollowUp(message.channel.id, client.user.id) &&
		sleepBehavior !== "sleep"
	) {
		trackSpeaker(message.channel.id, message.author.id);
		const { markReplied } = await import("./state/state.js");
		markReplied(message.channel.id);
		console.log(`[bot] #${channelName} ${author}: follow-up immédiat`);

		const delay = computeDelay(
			"follow-up",
			sleepBehavior,
			message.content.length,
			getGlobalInactivityMs()
		);
		await new Promise((r) => setTimeout(r, delay));

		if (shouldReact("follow-up", sleepBehavior)) {
			const emojis = getServerEmojis(message, isDM);
			const reaction = pickReaction(emojis);
			await message.addReaction(reaction).catch(() => {});
		}

		await triggerLunaReply(message, isDM, "follow-up");
		checkSessionLimit(cid, () => {
			void resetLLM();
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
	startPruning();

	client.connect();

	setInterval(() => {
		if (Math.random() < config.spontaneousChance) {
			void trySpawn(client);
		}
	}, config.spontaneousIntervalMs);
}
