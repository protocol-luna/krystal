import { voiceMessageChance } from "../config.js";
import { isTTSReady, synthesize } from "./piper.js";
import {
	sanitizeForTTS,
	buildWaveformBase64,
	wavToOgg,
	getAudioDuration,
} from "./audio.js";
import {
	requestUploadUrl,
	putFileToUploadUrl,
	postVoiceMessage,
} from "./upload.js";

export async function sendTextAsVoiceMessage(
	channelId: string,
	replyToMessageId: string,
	text: string,
): Promise<void> {
	if (!isTTSReady()) {
		console.warn("[tts] Piper not ready, skipping voice message");
		return;
	}

	const safe = sanitizeForTTS(text);
	if (!safe) {
		console.warn("[tts] Empty text after sanitization, skipping");
		return;
	}

	try {
		console.log(`[tts] Synthesizing: "${safe.slice(0, 60)}..."`);
		const { audio: wavBuf } = await synthesize(safe);
		const oggBuf = await wavToOgg(wavBuf);
		const durationSecs = await getAudioDuration(oggBuf);
		const waveform = buildWaveformBase64();

		const { uploadUrl, uploadFilename } = await requestUploadUrl(
			channelId,
			oggBuf.byteLength,
			durationSecs,
		);
		await putFileToUploadUrl(uploadUrl, oggBuf);
		await postVoiceMessage(
			channelId,
			uploadFilename,
			durationSecs,
			waveform,
			replyToMessageId,
		);
		console.log("[tts] Voice message sent");
	} catch (err) {
		console.error("[tts] Error sending voice message:", err);
	}
}

export function shouldSendVoice(): boolean {
	if (voiceMessageChance <= 0) {
		return false;
	}
	const roll = Math.random();
	const send = roll < voiceMessageChance;
	console.log(
		`[tts] voiceMessage=${send} (roll=${roll.toFixed(3)} < chance=${voiceMessageChance})`,
	);
	return send;
}
