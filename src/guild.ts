import type * as Eris from "eris";

const TEXT_CHANNEL_TYPES = new Set([0, 5, 11, 12]);

export function isTextChannel(c: Eris.AnyChannel): c is Eris.TextChannel {
  return TEXT_CHANNEL_TYPES.has(c.type);
}

export function findMostActiveChannel(guild: Eris.Guild): Eris.TextChannel | null {
  let mostActive: Eris.TextChannel | null = null;
  let highestId = "0";

  for (const channel of guild.channels.values()) {
    if (!isTextChannel(channel)) { continue; }
    if (channel.lastMessageID && channel.lastMessageID > highestId) {
      highestId = channel.lastMessageID;
      mostActive = channel;
    }
  }

  return mostActive;
}
