import type * as Eris from "eris";
import {
	typoCorrectionDelay,
	typoCorrectionDelayMax,
	typoCorrectionStyle,
} from "../config.js";

export type CorrectionStyle = "edit" | "message" | "mixed";

export interface TypoCorrectionState {
	chunkIndex: number;
	original: string;
	correctedWord: string;
}

export async function applyTypoCorrection(
	client: Eris.Client,
	channelId: string,
	messageId: string,
	correction: TypoCorrectionState
): Promise<void> {
	const delay =
		typoCorrectionDelay +
		Math.random() * (typoCorrectionDelayMax - typoCorrectionDelay);
	const style = resolveStyle();

	await new Promise((r) => setTimeout(r, delay));

	try {
		if (style === "edit") {
			await client.editMessage(channelId, messageId, {
				content: correction.original,
			});
			console.log(`[bot] typo corrigé par edit sur ${messageId}`);
		} else {
			await client.createMessage(channelId, {
				content: `${correction.correctedWord}*`,
			});
			console.log(
				`[bot] typo corrigé par message: ${correction.correctedWord}*`
			);
		}
	} catch {
		// message déjà supprimé ou édité par quelqu'un
	}
}

function resolveStyle(): CorrectionStyle {
	if (typoCorrectionStyle === "mixed") {
		return Math.random() < 0.5 ? "edit" : "message";
	}
	return typoCorrectionStyle;
}
