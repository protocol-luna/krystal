import type * as Eris from "eris";
import { randomChance, names, keywords, cooldownSeconds, replyInDM } from "./config.js";

const channelCooldowns = new Map<string, number>();

export interface TriggerResult {
  shouldRespond: boolean;
  reason: "mention" | "dm" | "name" | "keyword" | "random" | "follow-up" | "clear" | null;
  botName: string;
}

function isOnCooldown(channelId: string): boolean {
  const last = channelCooldowns.get(channelId);
  if (!last) { return false; }
  return Date.now() - last < cooldownSeconds * 1000;
}

function markReplied(channelId: string): void {
  channelCooldowns.set(channelId, Date.now());
}

export function evaluateMessage(
  message: Eris.Message,
  botId: string,
  botUsername: string,
  isFollowUp = false,
): TriggerResult {
  if (message.author.bot) {
    return { shouldRespond: false, reason: null, botName: "" };
  }

  if (message.content === "-clear") {
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
  const isDM = message.channel.type === 1;

  // Direct mention / DM
  if (isMentioned) {
    return { shouldRespond: true, reason: "mention", botName };
  }
  if (isDM && replyInDM) {
    return { shouldRespond: true, reason: "dm", botName };
  }
  if (isDM) {
    return { shouldRespond: false, reason: null, botName };
  }

  // Cooldown
  if (isOnCooldown(message.channel.id) && !isMentioned && !isFollowUp) {
    return { shouldRespond: false, reason: null, botName };
  }

  // Name detection (server nick + global username)
  if (contentLower.includes(botName.toLowerCase())) {
    markReplied(message.channel.id);
    return { shouldRespond: true, reason: "name", botName };
  }

  // Configurable extra names
  for (const name of names) {
    if (contentLower.includes(name.toLowerCase())) {
      markReplied(message.channel.id);
      return { shouldRespond: true, reason: "name", botName };
    }
  }

  // Configurable keywords
  for (const keyword of keywords) {
    if (contentLower.includes(keyword.toLowerCase())) {
      markReplied(message.channel.id);
      return { shouldRespond: true, reason: "keyword", botName };
    }
  }

  // Follow-up: bot replied last, same author continues
  if (isFollowUp) {
    return { shouldRespond: true, reason: "follow-up", botName };
  }

  // Random spontaneous chime-in
  if (randomChance > 0 && Math.random() < randomChance) {
    markReplied(message.channel.id);
    return { shouldRespond: true, reason: "random", botName };
  }

  return { shouldRespond: false, reason: null, botName };
}

export function isFollowUpMessage(
  prevMsg: Eris.Message | undefined,
  currentMsg: Eris.Message,
  botId: string,
): boolean {
  if (!prevMsg) { return false; }
  return prevMsg.author.id === botId && currentMsg.author.id !== botId;
}

export function clearCooldown(channelId: string): void {
  channelCooldowns.delete(channelId);
}
