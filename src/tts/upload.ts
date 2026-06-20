import { DISCORD_TOKEN } from "../config.js";

interface UploadResult {
	uploadUrl: string;
	uploadFilename: string;
}

export async function requestUploadUrl(
	channelId: string,
	size: number,
	duration: number
): Promise<UploadResult> {
	const token = DISCORD_TOKEN;
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

export async function putFileToUploadUrl(
	uploadUrl: string,
	buffer: Buffer
): Promise<void> {
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

export async function postVoiceMessage(
	channelId: string,
	uploadFilename: string,
	durationSecs: number,
	waveformB64: string,
	replyToMessageId?: string
): Promise<void> {
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
	const token = DISCORD_TOKEN;
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
