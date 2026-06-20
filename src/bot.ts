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
import {
	applyTypoCorrection,
	type TypoCorrectionState,
} from "./bot/typo-correction.js";

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

	try {
		const content = message.content
			.replace(new RegExp(`<@!?${client.user.id}>`, "g"), "")
			.trim();

		const displayName =
			(message.member as Eris.Member | null)?.nick || message.author.username;

		const isVoice = shouldSendVoice();
		const chunks: string[] = [];

		onToken = (chunk: string) => chunks.push(chunk);
		llmBus.on("token", onToken);

		if (!isVoice) {
			llmBus.once("token", startTyping);
		}

		const fullText = await askLLM({ username: displayName, text: content });

		if (isVoice && !hasUnsafeTTSText(fullText)) {
			await sendTextAsVoiceMessage(message.channel.id, message.id, fullText);
		} else {
			let typoState: TypoCorrectionState | null = null;

			if (
				config.typoChance > 0 &&
				Math.random() < config.typoChance &&
				chunks.length > 0
			) {
				const idx = Math.floor(Math.random() * chunks.length);
				const result = applyTypo(chunks[idx], config.typoLayout);
				if (result) {
					chunks[idx] = result.text;
					typoState = {
						chunkIndex: idx,
						original: result.original,
						correctedWord: result.correctedWord,
					};
				}
			}

			let isFirstChunk = true;
			let typoMessageId: string | null = null;
			for (const chunk of chunks) {
				if (!isFirstChunk) {
					const cpm = config.typingWpm * 5;
					const baseDelay = (chunk.length / cpm) * 60000;
					const delay = baseDelay * (0.5 + Math.random() * 0.5);
					await new Promise((r) => setTimeout(r, delay));
				}
				const sent = await client.createMessage(message.channel.id, {
					content: chunk,
					...(isFirstChunk && refStyle.messageReference
						? {
								messageReference: { messageID: message.id },
								allowedMentions: {
									repliedUser: refStyle.mentionRepliedUser,
								},
							}
						: {}),
				});
				isFirstChunk = false;
				markBotActivity(message.channel.id);

				if (typoState && typoMessageId === null) {
					typoMessageId = sent.id;
				}
			}

			if (typoMessageId && typoState) {
				await applyTypoCorrection(
					client,
					message.channel.id,
					typoMessageId,
					typoState
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
		if (typingInterval) {
			clearInterval(typingInterval);
		}
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
	sleepBehavior: string | null,
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
	sleepBehavior: string | null
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

client.on("ready", () => {
	console.log(
		`Connecté comme ${client.user.username}#${(client.user as Eris.User).discriminator} (Mode CLI Interactif Strict)`
	);
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

	if (result.shouldRespond) {
		trackSpeaker(message.channel.id, message.author.id);
		if (shouldIgnore(result.reason, sleepBehavior)) {
			console.log(`[bot] #${channelName} ${author}: ignoré (${result.reason})`);
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
