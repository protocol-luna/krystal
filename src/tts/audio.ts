import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ffmpegPath, ffprobePath } from "../config.js";

export function sanitizeForTTS(text: string): string {
	let t = (text || "")
		.replace(/<@&?\d+>/g, "@utilisateur")
		.replace(/<#\d+>/g, "")
		.replace(/<a?:[\w-]+:\d+>/g, "")
		.replace(/https?:\/\/\S+/g, "")
		.replace(/[^\p{L}\p{N}\s@]/gu, "");
	if (t.length > 500) {
		t = t.slice(0, 500);
	}
	return t.trim() || "...";
}

export function buildWaveformBase64(points = 256): string {
	const arr = new Uint8Array(points);
	for (let i = 0; i < points; i++) {
		arr[i] = Math.floor(127 + 127 * Math.sin((i / points) * Math.PI * 2));
	}
	return Buffer.from(arr).toString("base64");
}

export async function wavToOgg(wavBuf: Buffer): Promise<Buffer> {
	const tmpWav = path.join(os.tmpdir(), `piper_${Date.now()}.wav`);
	const tmpOgg = path.join(os.tmpdir(), `piper_${Date.now()}.ogg`);
	try {
		fs.writeFileSync(tmpWav, wavBuf);
		await new Promise<void>((resolve, reject) => {
			execFile(
				ffmpegPath,
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

export async function getAudioDuration(oggBuf: Buffer): Promise<number> {
	const tmpOgg = path.join(os.tmpdir(), `dur_${Date.now()}.ogg`);
	try {
		fs.writeFileSync(tmpOgg, oggBuf);
		const duration = await new Promise<number>((resolve, reject) => {
			execFile(
				ffprobePath,
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

export function hasUnsafeTTSText(text: string): boolean {
	// biome-ignore lint/suspicious/noMisleadingCharacterClass: emoji ranges intentionally broad
	return /[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/u.test(
		text
	);
}
