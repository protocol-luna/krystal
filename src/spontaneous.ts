import type * as Eris from "eris";
import { findMostActiveChannel, isTextChannel } from "./guild.js";
import { askLLM, resetLLM, isLLMBusy } from "./core/llm-client.js";
import { markBotActivity } from "./state/state.js";
import { config } from "./config.js";

const CACHE_TTL = 60_000;
const activeChannelCache = new Map<
	string,
	{ channel: Eris.TextChannel; timestamp: number }
>();

function getCachedActiveChannel(
	guild: Eris.Guild
): Eris.TextChannel | undefined {
	const now = Date.now();
	for (const [id, entry] of activeChannelCache) {
		if (now - entry.timestamp >= CACHE_TTL) {
			activeChannelCache.delete(id);
		}
	}
	const cached = activeChannelCache.get(guild.id);
	if (cached && now - cached.timestamp < CACHE_TTL) {
		return cached.channel;
	}
	const channel = findMostActiveChannel(guild);
	if (channel) {
		activeChannelCache.set(guild.id, { channel, timestamp: now });
		return channel;
	}
}

function pickWeightedGuild(
	client: Eris.Client
): { guild: Eris.Guild; channel: Eris.TextChannel } | null {
	const whitelist =
		config.spontaneousWhitelist === "*"
			? null
			: new Set(config.spontaneousWhitelist.split(",").map((id) => id.trim()));

	const guilds = [...client.guilds.values()].filter((g) => {
		if (whitelist && !whitelist.has(g.id)) {
			return false;
		}
		return [...g.channels.values()].some((c) => isTextChannel(c));
	});
	if (guilds.length === 0) {
		return null;
	}

	const ranked: {
		guild: Eris.Guild;
		channel: Eris.TextChannel;
		lastId: bigint;
	}[] = [];
	for (const guild of guilds) {
		const channel = getCachedActiveChannel(guild);
		if (!channel) {
			continue;
		}
		ranked.push({
			guild,
			channel,
			lastId: BigInt(channel.lastMessageID ?? "0"),
		});
	}
	ranked.sort((a, b) => {
		if (b.lastId > a.lastId) {
			return 1;
		}
		if (b.lastId < a.lastId) {
			return -1;
		}
		return 0;
	});

	if (ranked.length === 0) {
		return null;
	}

	const total = (ranked.length * (ranked.length + 1)) / 2;
	let roll = Math.random() * total;

	for (let i = 0; i < ranked.length; i++) {
		roll -= ranked.length - i;
		if (roll <= 0) {
			return ranked[i];
		}
	}

	return ranked[ranked.length - 1];
}

async function fetchContext(
	channel: Eris.TextChannel,
	count: number
): Promise<string> {
	try {
		const messages = await channel.getMessages({ limit: count });
		const lines: string[] = [];
		for (const msg of messages.reverse()) {
			const name = msg.member?.nick || msg.author.username;
			lines.push(`${name}: ${msg.content.replace(/\n/g, " ")}`);
		}
		return lines.join("\n");
	} catch {
		return "";
	}
}

export async function trySpawn(client: Eris.Client): Promise<void> {
	if (await isLLMBusy()) {
		return;
	}

	const picked = pickWeightedGuild(client);
	if (!picked) {
		return;
	}

	const context = await fetchContext(
		picked.channel,
		config.spontaneousContextMessages
	);

	resetLLM(picked.channel.id);

	let reply = "";

	await askLLM(
		{
			username: "system",
			sessionId: picked.channel.id,
			text: context
				? `Recent conversation in #${picked.channel.name}:\n${context}\n\nJoin the conversation naturally. Keep it short and relevant to what was just said.`
				: `You are in #${picked.channel.name}. The channel is quiet. Say something engaging to spark conversation. Keep it short.`,
		},
		{
			onFirstToken: () => {},
			onChunk: (chunk: string) => {
				reply += chunk;
			},
		}
	);

	if (reply.trim()) {
		try {
			await client.createMessage(picked.channel.id, { content: reply.trim() });
			markBotActivity(picked.channel.id);
			console.log(
				`[spontaneous] #${picked.channel.name} : " ${reply.slice(0, 100).replace(/\n/g, " ")} "`
			);
		} catch {
			console.log(
				`[spontaneous] #${picked.channel.name} : échec envoi (permissions ?)`
			);
		}
	} else {
		console.log(`[spontaneous] #${picked.channel.name} : réponse vide`);
	}

	resetLLM(picked.channel.id);
}
