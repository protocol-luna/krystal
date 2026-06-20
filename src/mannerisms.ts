import {
	responseDelayMin,
	responseDelayMax,
	reactionChance,
	ignoreChance,
	reactions,
	serverEmojiChance,
} from "./config.js";

function pickIgnoreChance(reason: string | null): number {
	switch (reason) {
		case "mention":
		case "dm":
		case "follow-up":
			return 0;
		case "name":
			return 0.05;
		case "random":
			return 0.15;
		default:
			return ignoreChance;
	}
}

function pickReactionChance(reason: string | null): number {
	switch (reason) {
		case "mention":
			return 0.08;
		case "dm":
			return 0.05;
		case "name":
			return 0.06;
		case "keyword":
			return 0.04;
		case "follow-up":
			return 0.03;
		case "random":
			return 0.02;
		default:
			return reactionChance;
	}
}

export function computeDelay(
	reason: string | null = null,
	sleepBehavior?: string | null
): number {
	let min = responseDelayMin;
	let max = responseDelayMax;
	switch (reason) {
		case "mention":
			min = 300;
			max = 1500;
			break;
		case "dm":
			min = 400;
			max = 1800;
			break;
		case "keyword":
			min = 1000;
			max = 3500;
			break;
		case "follow-up":
			min = 500;
			max = 2000;
			break;
		case "random":
			min = 1500;
			max = 5000;
			break;
	}
	let delay = min + Math.random() * (max - min);
	if (sleepBehavior === "slow") {
		delay *= 3 + Math.random() * 2;
	}
	console.log(
		`[mannerisms] delay=${delay.toFixed(0)}ms (reason=${reason} sleep=${sleepBehavior ?? "none"})`
	);
	return delay;
}

export function shouldIgnore(
	reason: string | null,
	sleepBehavior?: string | null
): boolean {
	let chance = pickIgnoreChance(reason);
	if (sleepBehavior === "short") {
		chance = Math.min(chance + 0.3, 0.9);
	}
	if (chance <= 0) {
		return false;
	}
	const roll = Math.random();
	const ignored = roll < chance;
	console.log(
		`[mannerisms] ignore=${ignored} (roll=${roll.toFixed(3)} < chance=${chance})`
	);
	return ignored;
}

export function shouldReact(
	reason: string | null = null,
	sleepBehavior?: string | null
): boolean {
	let chance = pickReactionChance(reason);
	if (sleepBehavior === "slow" || sleepBehavior === "short") {
		chance = Math.min(chance, 0.02);
	}
	if (chance <= 0) {
		console.log("[mannerisms] react=false (chance=0)");
		return false;
	}
	const roll = Math.random();
	const react = roll < chance;
	console.log(
		`[mannerisms] react=${react} (roll=${roll.toFixed(3)} < chance=${chance})`
	);
	return react;
}

export function pickReaction(customEmojis?: string[]): string {
	if (
		customEmojis &&
		customEmojis.length > 0 &&
		Math.random() < serverEmojiChance
	) {
		const emoji = customEmojis[Math.floor(Math.random() * customEmojis.length)];
		console.log(`[mannerisms] reaction=${emoji} (custom)`);
		return emoji;
	}
	const emoji = reactions[Math.floor(Math.random() * reactions.length)];
	console.log(`[mannerisms] reaction=${emoji} (unicode)`);
	return emoji;
}
