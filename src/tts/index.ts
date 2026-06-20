export { initTTS } from "./piper.js";
export { sendTextAsVoiceMessage } from "./voice-message.js";
export { hasUnsafeTTSText } from "./audio.js";

import { voiceMessageChance } from "../config.js";

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
