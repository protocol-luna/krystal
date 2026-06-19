import type * as Eris from "eris";
import { findMostActiveChannel } from "./guild.js";
import { askLLM, resetLLM, isLLMBusy } from "./llm-client.js";
import { markBotActivity } from "./trigger.js";
import { spontaneousContextMessages } from "./config.js";

function pickRandomGuild(client: Eris.Client): Eris.Guild | null {
  const guilds = [...client.guilds.values()];
  if (guilds.length === 0) { return null; }
  return guilds[Math.floor(Math.random() * guilds.length)];
}

async function fetchContext(
  channel: Eris.TextChannel,
  count: number,
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
  if (await isLLMBusy()) { return; }

  const guild = pickRandomGuild(client);
  if (!guild) { return; }

  const channel = findMostActiveChannel(guild);
  if (!channel) { return; }

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
    },
  );

  if (reply.trim()) {
    await client.createMessage(channel.id, { content: reply.trim() });
    markBotActivity(channel.id);
    console.log(`[spontaneous] → #${channel.name} : ${reply.slice(0, 80)}`);
  }

  await resetLLM();
}
