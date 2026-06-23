import type * as Eris from "eris";
import { config } from "../config.js";
import { isOnCooldown, setPaused, markReplied, isPaused } from "./state.js";

function log(channel: string, msg: string): void {
	console.log(`[trigger] #${channel} ${msg}`);
}

export interface TriggerResult {
	shouldRespond: boolean;
	reason:
		| "mention"
		| "dm"
		| "name"
		| "keyword"
		| "random"
		| "follow-up"
		| "clear"
		| "stop"
		| "start"
		| null;
	botName: string;
}

const hasWordCache = new Map<string, RegExp>();

function hasWord(text: string, word: string): boolean {
	let re = hasWordCache.get(word);
	if (!re) {
		re = new RegExp(
			`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`
		);
		hasWordCache.set(word, re);
	}
	return re.test(text);
}

export function evaluateMessage(
	message: Eris.Message,
	botId: string,
	botUsername: string,
	isFollowUp = false
): TriggerResult {
	const channelId = message.channel.id;

	if (message.author.bot) {
		log(channelId, `"${message.content.slice(0, 60)}" auteur=bot → ignore`);
		return { shouldRespond: false, reason: null, botName: "" };
	}

	if (message.content === "-stop") {
		log(channelId, "commande -stop → stop");
		return { shouldRespond: true, reason: "stop", botName: "" };
	}

	if (message.content === "-start") {
		log(channelId, "commande -start → start");
		return { shouldRespond: true, reason: "start", botName: "" };
	}

	if (message.content === "-clear") {
		log(channelId, "commande -clear → clear");
		return { shouldRespond: true, reason: "clear", botName: "" };
	}

	const isMe = botId === message.author.id;
	if (isMe) {
		return { shouldRespond: false, reason: null, botName: "" };
	}

	const guild = (message.channel as Eris.GuildTextableChannel).guild;
	const botMember = guild?.members?.get(botId);
	const botName = botMember?.nick || botUsername;
	const contentLower = message.content.toLowerCase();
	const isMentioned = message.mentions.some((u) => u.id === botId);
	const isDM = !message.guildID;
	const author = message.member?.nick || message.author.username;

	if (isMentioned) {
		log(channelId, `${author}: "${message.content.slice(0, 60)}" → mention`);
		setPaused(false);
		return { shouldRespond: true, reason: "mention", botName };
	}
	if (isDM) {
		log(channelId, `${author}: "${message.content.slice(0, 60)}" → dm`);
		setPaused(false);
		return { shouldRespond: true, reason: "dm", botName };
	}

	if (isPaused()) {
		log(channelId, `${author}: "${message.content.slice(0, 60)}" → paused`);
		return { shouldRespond: false, reason: null, botName: "" };
	}

	if (isOnCooldown(channelId) && !isMentioned && !isFollowUp) {
		log(channelId, `${author}: "${message.content.slice(0, 60)}" → cooldown`);
		return { shouldRespond: false, reason: null, botName };
	}

	if (hasWord(contentLower, botName.toLowerCase())) {
		log(
			channelId,
			`${author}: "${message.content.slice(0, 60)}" → name (bot:${botName})`
		);
		markReplied(channelId);
		return { shouldRespond: true, reason: "name", botName };
	}

	for (const name of config.names) {
		if (hasWord(contentLower, name.toLowerCase())) {
			log(
				channelId,
				`${author}: "${message.content.slice(0, 60)}" → name (custom:${name})`
			);
			markReplied(channelId);
			return { shouldRespond: true, reason: "name", botName };
		}
	}

	for (const keyword of config.keywords) {
		if (hasWord(contentLower, keyword.toLowerCase())) {
			log(
				channelId,
				`${author}: "${message.content.slice(0, 60)}" → keyword (${keyword})`
			);
			markReplied(channelId);
			return { shouldRespond: true, reason: "keyword", botName };
		}
	}

	if (isFollowUp) {
		log(channelId, `${author}: "${message.content.slice(0, 60)}" → follow-up`);
		return { shouldRespond: true, reason: "follow-up", botName };
	}

	if (config.randomChance > 0 && Math.random() < config.randomChance) {
		log(channelId, `${author}: "${message.content.slice(0, 60)}" → random`);
		markReplied(channelId);
		return { shouldRespond: true, reason: "random", botName };
	}

	log(channelId, `${author}: "${message.content.slice(0, 60)}" → rien`);
	return { shouldRespond: false, reason: null, botName };
}
