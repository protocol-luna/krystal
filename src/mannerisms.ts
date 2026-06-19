import {
  responseDelayMin,
  responseDelayMax,
  reactionChance,
  ignoreChance,
  ignoreChanceMention,
  reactions,
} from "./config.js";

export function computeDelay(): number {
  return responseDelayMin + Math.random() * (responseDelayMax - responseDelayMin);
}

export function shouldIgnore(reason: string | null): boolean {
  if (reason === "mention") {
    return Math.random() < ignoreChanceMention;
  }
  return Math.random() < ignoreChance;
}

export function shouldReact(): boolean {
  return Math.random() < reactionChance;
}

export function pickReaction(): string {
  return reactions[Math.floor(Math.random() * reactions.length)];
}
