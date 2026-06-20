import * as Eris from "eris";
import { resetLLM } from "../core/llm-core.js";
import { clearCooldown, trackSpeaker, setPaused } from "../state/state.js";

export const reactionCommands: Record<string, "stop" | "start" | "clear"> = {
	"❌": "stop",
	"▶️": "start",
	"🗑️": "clear",
};

export async function handleReactionCommand(
	message: Eris.Message,
	emojiName: string,
	userId: string
): Promise<void> {
	const cmd = reactionCommands[emojiName];
	if (!cmd) {
		return;
	}

	const channelName =
		message.channel instanceof Eris.TextChannel
			? message.channel.name
			: message.channel.id;

	console.log(`[bot] #${channelName} réaction ${emojiName} → ${cmd}`);

	if (cmd === "stop") {
		await resetLLM();
		clearCooldown(message.channel.id);
		trackSpeaker(message.channel.id, userId);
		setPaused(true);
	} else if (cmd === "start") {
		setPaused(false);
	} else if (cmd === "clear") {
		await resetLLM();
		clearCooldown(message.channel.id);
		trackSpeaker(message.channel.id, userId);
	}

	try {
		await message.addReaction("✅");
	} catch {
		/* ignore */
	}
}
