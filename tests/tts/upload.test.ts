import { describe, it, expect, beforeAll } from "bun:test";
import { mockConfig } from "../_mock-config.js";

describe("requestUploadUrl", () => {
	beforeAll(() => mockConfig());

	it("throws on non-ok response", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => new Response(null, { status: 403 });
		const { requestUploadUrl } = await import("../../src/tts/upload.js");
		await expect(requestUploadUrl("c1", 1000, 5)).rejects.toThrow(
			"attachments POST 403"
		);
		globalThis.fetch = originalFetch;
	});

	it("throws on missing upload_url in response", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () =>
			new Response(JSON.stringify({ attachments: [{}] }), { status: 200 });
		const { requestUploadUrl } = await import("../../src/tts/upload.js");
		await expect(requestUploadUrl("c1", 1000, 5)).rejects.toThrow(
			"URL d'upload"
		);
		globalThis.fetch = originalFetch;
	});

	it("returns upload URL and filename on success", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () =>
			new Response(
				JSON.stringify({
					attachments: [
						{
							upload_url: "https://cdn.example.com/upload",
							upload_filename: "voice.ogg",
						},
					],
				}),
				{ status: 200 }
			);
		const { requestUploadUrl } = await import("../../src/tts/upload.js");
		const result = await requestUploadUrl("c1", 1000, 5);
		expect(result.uploadUrl).toBe("https://cdn.example.com/upload");
		expect(result.uploadFilename).toBe("voice.ogg");
		globalThis.fetch = originalFetch;
	});
});

describe("putFileToUploadUrl", () => {
	beforeAll(() => mockConfig());

	it("throws on non-ok response", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => new Response(null, { status: 400 });
		const { putFileToUploadUrl } = await import("../../src/tts/upload.js");
		await expect(
			putFileToUploadUrl("https://cdn.example.com/upload", Buffer.from("test"))
		).rejects.toThrow("PUT upload 400");
		globalThis.fetch = originalFetch;
	});

	it("succeeds on ok response", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => new Response(null, { status: 200 });
		const { putFileToUploadUrl } = await import("../../src/tts/upload.js");
		await putFileToUploadUrl(
			"https://cdn.example.com/upload",
			Buffer.from("test")
		);
		globalThis.fetch = originalFetch;
	});
});

describe("postVoiceMessage", () => {
	beforeAll(() => mockConfig());

	it("throws on non-ok response", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => new Response(null, { status: 429 });
		const { postVoiceMessage } = await import("../../src/tts/upload.js");
		await expect(
			postVoiceMessage("c1", "voice.ogg", 5, "dGVzdA==")
		).rejects.toThrow("messages POST 429");
		globalThis.fetch = originalFetch;
	});

	it("includes message_reference when replyToMessageId is given", async () => {
		const originalFetch = globalThis.fetch;
		let body = "";
		globalThis.fetch = async (url: string, opts: any) => {
			body = opts.body;
			return new Response(null, { status: 200 });
		};
		const { postVoiceMessage } = await import("../../src/tts/upload.js");
		await postVoiceMessage("c1", "voice.ogg", 5, "dGVzdA==", "m1");
		const parsed = JSON.parse(body);
		expect(parsed.message_reference.message_id).toBe("m1");
		expect(parsed.flags).toBe(8192);
		globalThis.fetch = originalFetch;
	});

	it("omits message_reference when not given", async () => {
		const originalFetch = globalThis.fetch;
		let body = "";
		globalThis.fetch = async (url: string, opts: any) => {
			body = opts.body;
			return new Response(null, { status: 200 });
		};
		const { postVoiceMessage } = await import("../../src/tts/upload.js");
		await postVoiceMessage("c1", "voice.ogg", 5, "dGVzdA==");
		const parsed = JSON.parse(body);
		expect(parsed.message_reference).toBeUndefined();
		globalThis.fetch = originalFetch;
	});
});
