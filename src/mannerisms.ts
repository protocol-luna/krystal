import {
	responseDelayMin,
	responseDelayMax,
	reactionChance,
	ignoreChance,
	ignoreChanceMention,
	reactions,
	serverEmojiChance,
} from "./config.js";

export function computeDelay(): number {
	const delay =
		responseDelayMin + Math.random() * (responseDelayMax - responseDelayMin);
	console.log(`[mannerisms] delay=${delay.toFixed(0)}ms`);
	return delay;
}

export function shouldIgnore(reason: string | null): boolean {
	const chance =
		reason === "mention" || reason === "dm"
			? ignoreChanceMention
			: ignoreChance;
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

export function shouldReact(): boolean {
	if (reactionChance <= 0) {
		console.log("[mannerisms] react=false (chance=0)");
		return false;
	}
	const roll = Math.random();
	const react = roll < reactionChance;
	console.log(
		`[mannerisms] react=${react} (roll=${roll.toFixed(3)} < chance=${reactionChance})`
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
