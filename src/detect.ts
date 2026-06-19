import type * as Eris from "eris";

export interface DetectionResult {
  isMentioned: boolean;
  isDM: boolean;
  botName: string;
  hasBotName: boolean;
  hasPixie: boolean;
  isMe: boolean;
}

export function detectTrigger(
  message: Eris.Message,
  botId: string,
  botUsername: string,
): DetectionResult {
  const isMentioned = message.mentions.some((u) => u.id === botId);
  const isDM = message.channel.type === 1;
  const guild = (message.channel as Eris.GuildTextableChannel).guild;
  const botMember = guild?.members?.get(botId);
  const botName = botMember?.nick || botUsername;
  const hasBotName = message.content.toLowerCase().includes(botName.toLowerCase());
  const hasPixie = message.content.toLowerCase().includes("pixie");
  const isMe = botId === message.author.id;

  return { isMentioned, isDM, botName, hasBotName, hasPixie, isMe };
}
