import * as Eris from "eris";
import {
	DISCORD_TOKEN,
	pickReplyStyle,
	spontaneousIntervalMs,
	spontaneousChance,
} from "./config.js";
import { askLLM, resetLLM } from "./llm-client.js";
import {
	evaluateMessage,
	isRecentBotActivity,
	markBotActivity,
	markReplied,
	clearCooldown,
	trackSpeaker,
	canFollowUp,
	setPaused,
	dumpState,
	restoreState,
	type TriggerResult,
} from "./trigger.js";
import { trySpawn } from "./spontaneous.js";
import {
	computeDelay,
	shouldIgnore,
	shouldReact,
	pickReaction,
} from "./mannerisms.js";
import { initTTS, sendTextAsVoiceMessage, shouldSendVoice, hasUnsafeTTSText } from "./tts.js";
import { chunkDelayMin, chunkDelayMax, typoChance, typoCorrectionDelay, typoCorrectionDelayMax, typoLayout, typoCorrectionStyle } from "./config.js";
import { getSleepBehavior } from "./sleep.js";
import { applyTypo } from "./typo.js";
import { buildPending, scheduleSave, loadState } from "./persistence.js";

const client = new Eris.Client(DISCORD_TOKEN, {
	intents: ["guilds", "guildMessages", "guildMessageReactions", "messageContent", "directMessages"],
});

const processing = new Set<string>();
const pendingMessages = new Map<string, { message: Eris.Message; reason: string }>();

function pendingKey(channelId: string, userId: string): string {
	return `${channelId}:${userId}`;
}

function saveAllState(): void {
	const t = dumpState();
	scheduleSave({
		pendingMessages: buildPending(pendingMessages),
		paused: t.paused,
		channelCooldowns: t.channelCooldowns,
		botActivity: t.botActivity,
		lastSpeaker: t.lastSpeaker,
		responseCount: t.responseCount,
	});
}

async function triggerLunaReply(
	message: Eris.Message,
	isDM = false,
	reason: string | null = null
): Promise<void> {
	const key = pendingKey(message.channel.id, message.author.id);

	if (processing.has(key)) {
		pendingMessages.set(key, { message, reason: reason ?? "mention" });
		saveAllState();
		console.log(
			`[bot] #${(message.channel as Eris.GuildTextableChannel).name ?? message.channel.id} ${message.author.username}: mis en attente (déjà en cours)`
		);
		return;
	}

	processing.add(key);

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
	console.log(
		`[bot] replyStyle: messageReference=${refStyle.messageReference} mentionRepliedUser=${refStyle.mentionRepliedUser}`
	);

	try {
		const content = message.content
			.replace(new RegExp(`<@!?${client.user.id}>`, "g"), "")
			.trim();

		const displayName =
			(message.member as Eris.Member | null)?.nick || message.author.username;

		const isVoice = shouldSendVoice();
		const chunks: string[] = [];

		const fullText = await askLLM(
			{ username: displayName, text: content },
			{
				onFirstToken: isVoice ? undefined : startTyping,
				onChunk: (chunk: string) => {
					chunks.push(chunk);
				},
			}
		);

		if (isVoice && !hasUnsafeTTSText(fullText)) {
			await sendTextAsVoiceMessage(message.channel.id, message.id, fullText);
		} else {
			let typoIndex = -1;
			let typoOriginal = "";
			let result: ReturnType<typeof applyTypo> = null;
			if (typoChance > 0 && Math.random() < typoChance && chunks.length > 0) {
				typoIndex = Math.floor(Math.random() * chunks.length);
				result = applyTypo(chunks[typoIndex], typoLayout);
				if (result) {
					typoOriginal = result.original;
					chunks[typoIndex] = result.text;
				}
			}

			let isFirstChunk = true;
			let typoMessageId: string | null = null;
			for (const chunk of chunks) {
				if (!isFirstChunk) {
					const ratio = chunk.length / 200;
					const delay = chunkDelayMin + Math.random() * (chunkDelayMax - chunkDelayMin) * Math.min(ratio, 1);
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

				if (typoOriginal && typoIndex >= 0 && typoMessageId === null) {
					typoMessageId = sent.id;
				}
			}

			if (typoMessageId && typoOriginal) {
				const delay = typoCorrectionDelay + Math.random() * (typoCorrectionDelayMax - typoCorrectionDelay);
				const style = typoCorrectionStyle === "mixed"
					? (Math.random() < 0.5 ? "edit" : "message")
					: typoCorrectionStyle;
				await (async () => {
					await new Promise((r) => setTimeout(r, delay));
					try {
						if (style === "edit") {
							await client.editMessage(message.channel.id, typoMessageId, { content: typoOriginal });
							console.log(`[bot] typo corrigé par edit sur ${typoMessageId}`);
						} else {
							await client.createMessage(message.channel.id, {
								content: `${result!.correctedWord}*`,
							});
							console.log(`[bot] typo corrigé par message: ${result!.correctedWord}*`);
						}
					} catch {
						// message déjà supprimé ou édité par quelqu'un
					}
				})();
			}
		}

		trackSpeaker(message.channel.id, client.user.id);
	} catch (err) {
		console.error(err);
		try { await message.addReaction("❌"); } catch { /* ignore */ }
	} finally {
		processing.delete(key);
		if (typingInterval) {
			clearInterval(typingInterval);
		}

		const queued = pendingMessages.get(key);
		if (queued) {
			pendingMessages.delete(key);
			saveAllState();
			console.log(
				`[bot] #${(message.channel as Eris.GuildTextableChannel).name ?? message.channel.id} ${message.author.username}: répond au message en attente (${queued.reason})`
			);
			await triggerLunaReply(queued.message, queued.message.channel.type === 1, queued.reason);
		}
	}
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
	const isDM = message.channel.type === 1;

	const result: TriggerResult = evaluateMessage(
		message,
		client.user.id,
		client.user.username
	);

	if (result.reason === "stop") {
		console.log(
			`[bot] #${channel.name ?? message.channel.id} ${author}: -stop → pause`
		);
		await resetLLM();
		clearCooldown(message.channel.id);
		trackSpeaker(message.channel.id, message.author.id);
		setPaused(true);
		saveAllState();
		try { await message.addReaction("✅"); } catch { /* ignore */ }
		return;
	}

	if (result.reason === "start") {
		console.log(
			`[bot] #${channel.name ?? message.channel.id} ${author}: -start → reprise`
		);
		setPaused(false);
		saveAllState();
		try { await message.addReaction("✅"); } catch { /* ignore */ }
		return;
	}

	if (result.reason === "clear") {
		console.log(
			`[bot] #${channel.name ?? message.channel.id} ${author}: -clear → reset`
		);
		await resetLLM();
		clearCooldown(message.channel.id);
		trackSpeaker(message.channel.id, message.author.id);
		saveAllState();
		try { await message.addReaction("✅"); } catch { /* ignore */ }
		return;
	}

	const sleepBehavior = getSleepBehavior();
	if (sleepBehavior === "sleep" && result.reason !== "mention" && result.reason !== "dm") {
		console.log(
			`[bot] #${channel.name ?? message.channel.id} ${author}: ignoré (sommeil)`
		);
		return;
	}

	if (result.shouldRespond) {
		trackSpeaker(message.channel.id, message.author.id);
		if (shouldIgnore(result.reason, sleepBehavior)) {
			console.log(
				`[bot] #${channel.name ?? message.channel.id} ${author}: ignoré (${result.reason})`
			);
			return;
		}

		const delay = computeDelay(result.reason, sleepBehavior);
		console.log(
			`[bot] #${channel.name ?? message.channel.id} ${author}: répond (${result.reason}) delay=${delay.toFixed(0)}ms`
		);
		await new Promise((r) => setTimeout(r, delay));

		if (shouldReact(result.reason, sleepBehavior)) {
			const serverEmojis = isDM
				? undefined
				: (channel as Eris.GuildTextableChannel).guild?.emojis
						?.filter((e) => e.id)
						?.map((e) => `${e.animated ? "a:" : ""}${e.name}:${e.id}`);
			const reaction = pickReaction(serverEmojis);
			await message.addReaction(reaction).catch(() => {});
		}

		await triggerLunaReply(message, isDM, result.reason);
		return;
	}

	if (canFollowUp(message.channel.id, client.user.id) && sleepBehavior !== "sleep") {
		trackSpeaker(message.channel.id, message.author.id);
		markReplied(message.channel.id);
		console.log(
			`[bot] #${channel.name ?? message.channel.id} ${author}: follow-up immédiat`
		);
		await new Promise((r) => setTimeout(r, computeDelay("follow-up", sleepBehavior)));

		if (shouldReact("follow-up", sleepBehavior)) {
			const serverEmojis = isDM
				? undefined
				: (channel as Eris.GuildTextableChannel).guild?.emojis
						?.filter((e) => e.id)
						?.map((e) => `${e.animated ? "a:" : ""}${e.name}:${e.id}`);
			const reaction = pickReaction(serverEmojis);
			await message.addReaction(reaction).catch(() => {});
		}

		await triggerLunaReply(message, isDM, "follow-up");
	}

	trackSpeaker(message.channel.id, message.author.id);
});

const reactionCommands: Record<string, "stop" | "start" | "clear"> = {
	"❌": "stop",
	"▶️": "start",
	"🗑️": "clear",
};

client.on("messageReactionAdd", async (message: Eris.Message, emoji: { name: string; id?: string }, userId: string) => {
	if (userId === client.user.id) { return; }
	if (message.author.id !== client.user.id) { return; }
	if (!(message.channel instanceof Eris.TextChannel)) { return; }

	const cmd = reactionCommands[emoji.name];
	if (!cmd) { return; }

	console.log(`[bot] #${message.channel.name} réaction ${emoji.name} → ${cmd}`);

	if (cmd === "stop") {
		await resetLLM();
		clearCooldown(message.channel.id);
		trackSpeaker(message.channel.id, userId);
		setPaused(true);
		saveAllState();
		try { await message.addReaction("✅"); } catch { /* ignore */ }
	} else if (cmd === "start") {
		setPaused(false);
		saveAllState();
		try { await message.addReaction("✅"); } catch { /* ignore */ }
	} else if (cmd === "clear") {
		await resetLLM();
		clearCooldown(message.channel.id);
		trackSpeaker(message.channel.id, userId);
		saveAllState();
		try { await message.addReaction("✅"); } catch { /* ignore */ }
	}
});

export async function startBot(): Promise<void> {
	void initTTS();

	const saved = loadState();
	restoreState(saved);

	for (const entry of saved.pendingMessages) {
		try {
			const msg = await client.getMessage(entry.channelId, entry.messageId);
			const key = pendingKey(entry.channelId, entry.userId);
			if (!processing.has(key)) {
				pendingMessages.set(key, { message: msg, reason: entry.reason });
			}
		} catch {
			// message supprimé ou channel inaccessible
		}
	}

	client.connect();

	setInterval(() => {
		if (Math.random() < spontaneousChance) {
			void trySpawn(client);
		}
	}, spontaneousIntervalMs);
}
