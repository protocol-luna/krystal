import {
	reactions,
	serverEmojiChance,
	concentration,
	type ConcentrationThresholds,
} from "../config.js";

const REASONS: (keyof ConcentrationThresholds)[] = [
	"mention",
	"dm",
	"name",
	"keyword",
	"follow-up",
	"random",
];

function getThresholds(reason: string | null): ConcentrationThresholds[keyof ConcentrationThresholds] {
	if (reason && REASONS.includes(reason as keyof ConcentrationThresholds)) {
		return concentration[reason as keyof ConcentrationThresholds];
	}
	return concentration.default;
}

export function computeDelay(
	reason: string | null = null,
	sleepBehavior?: string | null,
): number {
	const t = getThresholds(reason);
	let delay = t.delay_min + Math.random() * (t.delay_max - t.delay_min);
	if (sleepBehavior === "slow") {
		delay *= 3 + Math.random() * 2;
	}
	console.log(
		`[mannerisms] delay=${delay.toFixed(0)}ms (reason=${reason} sleep=${sleepBehavior ?? "none"})`,
	);
	return delay;
}

export function shouldIgnore(
	reason: string | null,
	sleepBehavior?: string | null,
): boolean {
	const t = getThresholds(reason);
	let chance = t.ignore_chance;
	if (sleepBehavior === "short") {
		chance = Math.min(chance + 0.3, 0.9);
	}
	if (chance <= 0) {
		return false;
	}
	const roll = Math.random();
	const ignored = roll < chance;
	console.log(
		`[mannerisms] ignore=${ignored} (roll=${roll.toFixed(3)} < chance=${chance})`,
	);
	return ignored;
}

export function shouldReact(
	reason: string | null = null,
	sleepBehavior?: string | null,
): boolean {
	const t = getThresholds(reason);
	let chance = t.reaction_chance;
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
		`[mannerisms] react=${react} (roll=${roll.toFixed(3)} < chance=${chance})`,
	);
	return react;
}

export function pickReaction(customEmojis?: string[]): string {
	if (
		customEmojis &&
		customEmojis.length > 0 &&
		Math.random() < serverEmojiChance
	) {
		const emoji =
			customEmojis[Math.floor(Math.random() * customEmojis.length)];
		console.log(`[mannerisms] reaction=${emoji} (custom)`);
		return emoji;
	}
	const emoji = reactions[Math.floor(Math.random() * reactions.length)];
	console.log(`[mannerisms] reaction=${emoji} (unicode)`);
	return emoji;
}
