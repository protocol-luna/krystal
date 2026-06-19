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
	type TriggerResult,
} from "./trigger.js";
import { trySpawn } from "./spontaneous.js";
import {
	computeDelay,
	shouldIgnore,
	shouldReact,
	pickReaction,
} from "./mannerisms.js";
import { initTTS, sendTextAsVoiceMessage, shouldSendVoice } from "./tts.js";

const client = new Eris.Client(DISCORD_TOKEN, {
	intents: ["guilds", "guildMessages", "messageContent", "directMessages"],
});

async function triggerLunaReply(
	message: Eris.Message,
	isDM = false
): Promise<void> {
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

		if (isVoice) {
			await sendTextAsVoiceMessage(message.channel.id, message.id, fullText);
		} else {
			let isFirstChunk = true;
			for (const chunk of chunks) {
				await client.createMessage(message.channel.id, {
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
			}
		}

		trackSpeaker(message.channel.id, client.user.id);
	} catch (err) {
		console.error(err);
		await client
			.createMessage(message.channel.id, {
				content: `Erreur interne avec le processus llama-cli : ${(err as Error).message}`,
				...(refStyle.messageReference
					? {
							messageReference: { messageID: message.id },
							allowedMentions: { repliedUser: style.mentionRepliedUser },
						}
					: {}),
			})
			.then(() => markBotActivity(message.channel.id));
	} finally {
		if (typingInterval) {
			clearInterval(typingInterval);
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
		await client.createMessage(
			message.channel.id,
			"⏸️  Bot mis en pause. Envoie `-start` pour réactiver."
		);
		return;
	}

	if (result.reason === "start") {
		console.log(
			`[bot] #${channel.name ?? message.channel.id} ${author}: -start → reprise`
		);
		setPaused(false);
		await client.createMessage(message.channel.id, "▶️  Bot réactivé !");
		return;
	}

	if (result.reason === "clear") {
		console.log(
			`[bot] #${channel.name ?? message.channel.id} ${author}: -clear → reset`
		);
		await resetLLM();
		clearCooldown(message.channel.id);
		trackSpeaker(message.channel.id, message.author.id);
		await client.createMessage(
			message.channel.id,
			"🧹  Historique et mémoire effacés !"
		);
		return;
	}

	if (result.shouldRespond) {
		trackSpeaker(message.channel.id, message.author.id);
		if (shouldIgnore(result.reason)) {
			console.log(
				`[bot] #${channel.name ?? message.channel.id} ${author}: ignoré (${result.reason})`
			);
			return;
		}

		const delay = computeDelay();
		console.log(
			`[bot] #${channel.name ?? message.channel.id} ${author}: répond (${result.reason}) delay=${delay.toFixed(0)}ms`
		);
		await new Promise((r) => setTimeout(r, delay));

		if (shouldReact()) {
			const serverEmojis = isDM
				? undefined
				: (channel as Eris.GuildTextableChannel).guild?.emojis
						?.filter((e) => e.id)
						?.map((e) => `${e.animated ? "a:" : ""}${e.name}:${e.id}`);
			const reaction = pickReaction(serverEmojis);
			await message.addReaction(reaction).catch(() => {});
		}

		await triggerLunaReply(message, isDM);
		return;
	}

	if (canFollowUp(message.channel.id, client.user.id)) {
		trackSpeaker(message.channel.id, message.author.id);
		markReplied(message.channel.id);
		console.log(
			`[bot] #${channel.name ?? message.channel.id} ${author}: follow-up immédiat`
		);
		await new Promise((r) => setTimeout(r, computeDelay()));

		if (shouldReact()) {
			const serverEmojis = isDM
				? undefined
				: (channel as Eris.GuildTextableChannel).guild?.emojis
						?.filter((e) => e.id)
						?.map((e) => `${e.animated ? "a:" : ""}${e.name}:${e.id}`);
			const reaction = pickReaction(serverEmojis);
			await message.addReaction(reaction).catch(() => {});
		}

		await triggerLunaReply(message, isDM);
	}

	trackSpeaker(message.channel.id, message.author.id);
});

export function startBot(): void {
	void initTTS();
	client.connect();

	setInterval(() => {
		if (Math.random() < spontaneousChance) {
			void trySpawn(client);
		}
	}, spontaneousIntervalMs);
}
