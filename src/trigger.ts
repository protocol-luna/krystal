import type * as Eris from "eris";
import { randomChance, names, keywords, cooldownSeconds, replyInDM } from "./config.js";

const channelCooldowns = new Map<string, number>();
const botActivity = new Map<string, number>();
const lastSpeaker = new Map<string, string>();
const responseCount = new Map<string, number>();

const MAX_FOLLOWUPS = 3;
const FOLLOWUP_WINDOW = 60_000;

let paused = false;

export function isPaused(): boolean {
  return paused;
}

export function setPaused(v: boolean): void {
  paused = v;
}

export interface TriggerResult {
  shouldRespond: boolean;
  reason: "mention" | "dm" | "name" | "keyword" | "random" | "follow-up" | "clear" | "stop" | "start" | null;
  botName: string;
}

function isOnCooldown(channelId: string): boolean {
  const last = channelCooldowns.get(channelId);
  if (!last) { return false; }
  return Date.now() - last < cooldownSeconds * 1000;
}

function markReplied(channelId: string): void {
  const now = Date.now();
  channelCooldowns.set(channelId, now);
  botActivity.set(channelId, now);
  const count = responseCount.get(channelId) ?? 0;
  responseCount.set(channelId, count + 1);
  setTimeout(() => {
    const c = responseCount.get(channelId) ?? 1;
    responseCount.set(channelId, Math.max(0, c - 1));
  }, FOLLOWUP_WINDOW);
}

export function markBotActivity(channelId: string): void {
  botActivity.set(channelId, Date.now());
}

export function isRecentBotActivity(channelId: string, windowMs = 15000): boolean {
  const last = botActivity.get(channelId);
  if (!last) { return false; }
  return Date.now() - last < windowMs;
}

export function trackSpeaker(channelId: string, authorId: string): string | undefined {
  const previous = lastSpeaker.get(channelId);
  lastSpeaker.set(channelId, authorId);
  return previous;
}

export function canFollowUp(channelId: string, botId: string): boolean {
  if (!isRecentBotActivity(channelId)) { return false; }
  if (lastSpeaker.get(channelId) !== botId) { return false; }
  const count = responseCount.get(channelId) ?? 0;
  return count < MAX_FOLLOWUPS;
}

export function isInConversation(channelId: string, botId: string): boolean {
  return isRecentBotActivity(channelId) && lastSpeaker.get(channelId) === botId;
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

  if (message.content === "-stop") {
    return { shouldRespond: true, reason: "stop", botName: "" };
  }

  if (message.content === "-start") {
    return { shouldRespond: true, reason: "start", botName: "" };
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

  // Direct mention — always responds, bypasses pause
  if (isMentioned) {
    setPaused(false);
    return { shouldRespond: true, reason: "mention", botName };
  }
  if (isDM && replyInDM) {
    return { shouldRespond: true, reason: "dm", botName };
  }
  if (isDM) {
    return { shouldRespond: false, reason: null, botName };
  }

  if (paused) {
    return { shouldRespond: false, reason: null, botName: "" };
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

  // Follow-up: bot replied recently in this channel
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

export function clearCooldown(channelId: string): void {
  channelCooldowns.delete(channelId);
  botActivity.delete(channelId);
  responseCount.delete(channelId);
  lastSpeaker.delete(channelId);
}
