import { PiperTTS } from "pipertts";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	DISCORD_TOKEN,
	voiceMessageChance,
	ttsModelPath,
	ttsBinaryPath,
} from "./config.js";

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

function sanitizeForTTS(text: string): string {
	let t = text || ""
		.replace(/<@&?\d+>/g, "@utilisateur")
		.replace(/<#\d+>/g, "")
		.replace(/<a?:[\w-]+:\d+>/g, "")
		.replace(/https?:\/\/\S+/g, "");
	if (t.length > 500) {
		t = t.slice(0, 500);
	}
	return t.trim() || "...";
}

function buildWaveformBase64(points = 256): string {
	const arr = new Uint8Array(points);
	for (let i = 0; i < points; i++) {
		arr[i] = Math.floor(127 + 127 * Math.sin((i / points) * Math.PI * 2));
	}
	return Buffer.from(arr).toString("base64");
}

async function wavToOgg(wavBuf: Buffer): Promise<Buffer> {
	const tmpWav = path.join(os.tmpdir(), `piper_${Date.now()}.wav`);
	const tmpOgg = path.join(os.tmpdir(), `piper_${Date.now()}.ogg`);
	try {
		fs.writeFileSync(tmpWav, wavBuf);
		await new Promise<void>((resolve, reject) => {
			execFile(
				path.join(process.cwd(), "bin/ffmpeg"),
				[
					"-y",
					"-i",
					tmpWav,
					"-c:a",
					"libopus",
					"-b:a",
					"32k",
					"-ar",
					"24000",
					"-ac",
					"1",
					tmpOgg,
				],
				(err) => (err ? reject(err) : resolve())
			);
		});
		return fs.readFileSync(tmpOgg);
	} finally {
		try {
			fs.unlinkSync(tmpWav);
		} catch {
			/* ignore */
		}
		try {
			if (fs.existsSync(tmpOgg)) {
				fs.unlinkSync(tmpOgg);
			}
		} catch {
			/* ignore */
		}
	}
}

async function getAudioDuration(oggBuf: Buffer): Promise<number> {
	const tmpOgg = path.join(os.tmpdir(), `dur_${Date.now()}.ogg`);
	try {
		fs.writeFileSync(tmpOgg, oggBuf);
		const duration = await new Promise<number>((resolve, reject) => {
			execFile(
				path.join(process.cwd(), "bin/ffprobe"),
				[
					"-v",
					"error",
					"-show_entries",
					"format=duration",
					"-of",
					"csv=p=0",
					tmpOgg,
				],
				(err, stdout) =>
					err ? reject(err) : resolve(Number.parseFloat(stdout.trim()))
			);
		});
		return Math.ceil(duration);
	} catch {
		return Math.max(1, Math.ceil(oggBuf.byteLength / 8000));
	} finally {
		try {
			if (fs.existsSync(tmpOgg)) {
				fs.unlinkSync(tmpOgg);
			}
		} catch {
			/* ignore */
		}
	}
}

async function requestUploadUrl(
	channelId: string,
	size: number,
	duration: number,
	token: string
) {
	const res = await fetch(
		`https://discord.com/api/v10/channels/${channelId}/attachments`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `${token}`,
			},
			body: JSON.stringify({
				files: [
					{
						filename: "voice-message.ogg",
						file_size: size,
						id: "0",
						duration_secs: duration,
					},
				],
			}),
		}
	);
	if (!res.ok) {
		const txt = await res.text().catch(() => "");
		throw new Error(`attachments POST ${res.status}: ${txt}`);
	}
	const json = (await res.json()) as Record<string, unknown>;
	const a = (json.attachments as Record<string, unknown>[] | undefined)?.[0];
	if (!(a?.upload_url && a?.upload_filename)) {
		throw new Error("Réponse inattendue pour l'URL d'upload.");
	}
	return {
		uploadUrl: a.upload_url as string,
		uploadFilename: a.upload_filename as string,
	};
}

async function putFileToUploadUrl(uploadUrl: string, buffer: Buffer) {
	const res = await fetch(uploadUrl, {
		method: "PUT",
		headers: {
			"Content-Type": "audio/ogg",
			"Content-Length": String(buffer.byteLength),
		},
		body: new Uint8Array(buffer),
	});
	if (!res.ok) {
		const txt = await res.text().catch(() => "");
		throw new Error(`PUT upload ${res.status}: ${txt}`);
	}
}

async function postVoiceMessage(
	channelId: string,
	uploadFilename: string,
	durationSecs: number,
	waveformB64: string,
	token: string,
	replyToMessageId?: string
) {
	const body: Record<string, unknown> = {
		flags: 8192,
		attachments: [
			{
				id: "0",
				filename: "voice-message.ogg",
				uploaded_filename: uploadFilename,
				duration_secs: durationSecs,
				waveform: waveformB64,
			},
		],
		allowed_mentions: { parse: [], replied_user: false },
		fail_if_not_exists: false,
	};
	if (replyToMessageId) {
		body.message_reference = {
			message_id: replyToMessageId,
			channel_id: channelId,
		};
	}
	const res = await fetch(
		`https://discord.com/api/v10/channels/${channelId}/messages`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `${token}`,
			},
			body: JSON.stringify(body),
		}
	);
	if (!res.ok) {
		const txt = await res.text().catch(() => "");
		throw new Error(`messages POST ${res.status}: ${txt}`);
	}
}

export async function sendTextAsVoiceMessage(
	channelId: string,
	replyToMessageId: string,
	text: string
): Promise<void> {
	if (!piperReady) {
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
		const { audio: wavBuf } = await piper!.synthesize(safe);
		const oggBuf = await wavToOgg(wavBuf);
		const durationSecs = await getAudioDuration(oggBuf);
		const waveform = buildWaveformBase64();
		const token = DISCORD_TOKEN;

		const { uploadUrl, uploadFilename } = await requestUploadUrl(
			channelId,
			oggBuf.byteLength,
			durationSecs,
			token
		);
		await putFileToUploadUrl(uploadUrl, oggBuf);
		await postVoiceMessage(
			channelId,
			uploadFilename,
			durationSecs,
			waveform,
			token,
			replyToMessageId
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
		`[tts] voiceMessage=${send} (roll=${roll.toFixed(3)} < chance=${voiceMessageChance})`
	);
	return send;
}

export function hasUnsafeTTSText(text: string): boolean {
	// biome-ignore lint/suspicious/noMisleadingCharacterClass: emoji ranges intentionally broad
	return /[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/u.test(text);
}
