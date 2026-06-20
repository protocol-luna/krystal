import type * as Eris from "eris";
import { findMostActiveChannel, isTextChannel } from "./guild.js";
import { askLLM, resetLLM, isLLMBusy } from "./core/llm-client.js";
import { markBotActivity } from "./state/state.js";
import { spontaneousContextMessages, spontaneousWhitelist } from "./config.js";

function pickWeightedGuild(client: Eris.Client): Eris.Guild | null {
	const whitelist = spontaneousWhitelist === "*"
		? null
		: new Set(spontaneousWhitelist.split(",").map((id) => id.trim()));

	const guilds = [...client.guilds.values()].filter((g) => {
		if (whitelist && !whitelist.has(g.id)) {
			return false;
		}
		return [...g.channels.values()].some((c) => isTextChannel(c));
	});
	if (guilds.length === 0) {
		return null;
	}

	// Sort by most recent message across all text channels
	const ranked = guilds
		.map((g) => ({
			guild: g,
			lastID: findMostActiveChannel(g)?.lastMessageID ?? "0",
		}))
		.sort((a, b) => b.lastID.localeCompare(a.lastID));

	// Linear weight: top guild = N, second = N-1, ..., last = 1
	const total = (ranked.length * (ranked.length + 1)) / 2;
	let roll = Math.random() * total;

	for (let i = 0; i < ranked.length; i++) {
		roll -= ranked.length - i;
		if (roll <= 0) {
			return ranked[i].guild;
		}
	}

	return ranked[ranked.length - 1].guild;
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

	const guild = pickWeightedGuild(client);
	if (!guild) {
		return;
	}

	const channel = findMostActiveChannel(guild);
	if (!channel) {
		return;
	}

	const context = await fetchContext(channel, spontaneousContextMessages);

	await resetLLM();

	let reply = "";

	await askLLM(
		{
			username: "system",
			text: context
				? `Recent conversation in #${channel.name}:\n${context}\n\nJoin the conversation naturally. Keep it short and relevant to what was just said.`
				: `You are in #${channel.name}. The channel is quiet. Say something engaging to spark conversation. Keep it short.`,
		},
		{
			onFirstToken: () => {},
			onChunk: (chunk: string) => {
				reply += chunk;
			},
		}
	);

	if (reply.trim()) {
		await client.createMessage(channel.id, { content: reply.trim() });
		markBotActivity(channel.id);
		console.log(
			`[spontaneous] #${channel.name} : " ${reply.slice(0, 100).replace(/\n/g, " ")} "`
		);
	} else {
		console.log(`[spontaneous] #${channel.name} : réponse vide`);
	}

	await resetLLM();
}
