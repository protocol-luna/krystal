import type * as Eris from "eris";
import { randomChance, names, keywords, cooldownSeconds, replyInDM } from "./config.js";

function log(channel: string, msg: string): void {
  console.log(`[trigger] #${channel} ${msg}`);
}

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

export function markReplied(channelId: string): void {
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
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  const ok = recent && speaker === botId && count < MAX_FOLLOWUPS;
  log(channelId, `canFollowUp=${ok} (recentBot=${recent} lastSpeaker=${speaker === botId ? "bot" : speaker?.slice(0, 6) ?? "?"} followCount=${count})`);
  return ok;
}

export function isInConversation(channelId: string, botId: string): boolean {
  return isRecentBotActivity(channelId) && lastSpeaker.get(channelId) === botId;
}

function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text);
}

export function evaluateMessage(
  message: Eris.Message,
  botId: string,
  botUsername: string,
  isFollowUp = false,
): TriggerResult {
  const channelId = message.channel.id;

  if (message.author.bot) {
    log(channelId, `“${message.content.slice(0, 60)}” auteur=bot → ignore`);
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
  const isDM = message.channel.type === 1;
  const author = message.member?.nick || message.author.username;

  // Direct mention — always responds, bypasses pause
  if (isMentioned) {
    log(channelId, `${author}: “${message.content.slice(0, 60)}” → mention`);
    setPaused(false);
    return { shouldRespond: true, reason: "mention", botName };
  }
  if (isDM && replyInDM) {
    log(channelId, `${author}: “${message.content.slice(0, 60)}” → dm`);
    return { shouldRespond: true, reason: "dm", botName };
  }
  if (isDM) {
    log(channelId, `${author}: “${message.content.slice(0, 60)}” → DM ignoré`);
    return { shouldRespond: false, reason: null, botName };
  }

  if (paused) {
    log(channelId, `${author}: “${message.content.slice(0, 60)}” → paused`);
    return { shouldRespond: false, reason: null, botName: "" };
  }

  // Cooldown
  if (isOnCooldown(channelId) && !isMentioned && !isFollowUp) {
    log(channelId, `${author}: “${message.content.slice(0, 60)}” → cooldown`);
    return { shouldRespond: false, reason: null, botName };
  }

  // Name detection (server nick + global username)
  if (hasWord(contentLower, botName.toLowerCase())) {
    log(channelId, `${author}: “${message.content.slice(0, 60)}” → name (bot:${botName})`);
    markReplied(channelId);
    return { shouldRespond: true, reason: "name", botName };
  }

  // Configurable extra names
  for (const name of names) {
    if (hasWord(contentLower, name.toLowerCase())) {
      log(channelId, `${author}: “${message.content.slice(0, 60)}” → name (custom:${name})`);
      markReplied(channelId);
      return { shouldRespond: true, reason: "name", botName };
    }
  }

  // Configurable keywords
  for (const keyword of keywords) {
    if (hasWord(contentLower, keyword.toLowerCase())) {
      log(channelId, `${author}: “${message.content.slice(0, 60)}” → keyword (${keyword})`);
      markReplied(channelId);
      return { shouldRespond: true, reason: "keyword", botName };
    }
  }

  // Follow-up: bot replied recently in this channel
  if (isFollowUp) {
    log(channelId, `${author}: “${message.content.slice(0, 60)}” → follow-up`);
    return { shouldRespond: true, reason: "follow-up", botName };
  }

  // Random spontaneous chime-in
  if (randomChance > 0 && Math.random() < randomChance) {
    log(channelId, `${author}: “${message.content.slice(0, 60)}” → random`);
    markReplied(channelId);
    return { shouldRespond: true, reason: "random", botName };
  }

  log(channelId, `${author}: “${message.content.slice(0, 60)}” → rien`);
  return { shouldRespond: false, reason: null, botName };
}

export function clearCooldown(channelId: string): void {
  channelCooldowns.delete(channelId);
  botActivity.delete(channelId);
  responseCount.delete(channelId);
  lastSpeaker.delete(channelId);
}
