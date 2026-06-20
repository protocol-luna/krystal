import { PiperTTS } from "pipertts";
import { ttsModelPath, ttsBinaryPath } from "../config.js";
import path from "node:path";

let piper: PiperTTS | null = null;
let piperReady = false;

export async function initTTS(): Promise<void> {
	if (piperReady) {
		return;
	}
	try {
		piper = await PiperTTS.create({
			modelPath: ttsModelPath,
			piperBinaryPath: ttsBinaryPath,
		});
		piperReady = true;
		console.log(
			`[tts] Piper TTS initialized (model=${path.basename(ttsModelPath)})`
		);
	} catch (err) {
		console.warn("[tts] Piper TTS init failed, voice messages disabled:", err);
	}
}

export function isTTSReady(): boolean {
	return piperReady;
}

export function synthesize(text: string): Promise<{ audio: Buffer }> {
	return piper!.synthesize(text);
}
