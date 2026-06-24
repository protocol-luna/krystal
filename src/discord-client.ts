import puppeteer, { type Browser, type Page } from "puppeteer";
import { feedGatewayFrame } from "./core/gateway-bus.js";

declare global {
	interface Window {
		__puppetFetch(
			url: RequestInfo | URL,
			opts?: RequestInit
		): Promise<Response>;
	}
}

export class DiscordClient {
	private browser: Browser | null = null;
	private page: Page | null = null;
	private ready = false;

	async init(userToken: string): Promise<void> {
		this.browser = await puppeteer.launch({
			headless: false,
			userDataDir: "./chrome-profile",
			args: [
				"--disable-blink-features=AutomationControlled",
				"--no-sandbox",
				"--mute-audio",
				"--window-size=1280,720",
			],
		});

		const page = await this.browser.newPage();
		this.page = page;

		// Hook Gateway WebSocket frames via CDP for mention_token
		const cdp = await page.target().createCDPSession();
		await cdp.send("Network.enable");
		cdp.on(
			"Network.webSocketFrameReceived",
			({ response }: { response: { payloadData: string } }) => {
				feedGatewayFrame(response.payloadData);
				try {
					const data = JSON.parse(response.payloadData);
					if (data.t === "MESSAGE_CREATE" && data.d?.mention_token) {
						void this.ack(data.d.channel_id, data.d.id, data.d.mention_token);
					}
				} catch {
					// ignore parse errors on non-JSON frames
				}
			}
		);

		await page.goto("https://discord.com/login", {
			waitUntil: "domcontentloaded",
		});

		await page.evaluate((token: string) => {
			localStorage.setItem("token", JSON.stringify({ token, provider: null }));
		}, userToken);

		await page.goto("https://discord.com/channels/@me", {
			waitUntil: "networkidle2",
		});

		const authed = await page.evaluate(() =>
			Boolean(document.querySelector('[data-list-item-id="guildsnav___home"]'))
		);
		if (!authed) {
			throw new Error(
				"Injection du token échouée — vérifie que c'est un token utilisateur valide et que le profil chrome-profile est vide"
			);
		}

		this.ready = true;
		console.log("[discord-client] Chrome prêt — token injecté, session active");

		await this.hookFetch();
	}

	get isReady(): boolean {
		return this.ready;
	}

	async navigateTo(guildId: string, channelId: string): Promise<void> {
		if (!this.page) {
			return;
		}
		const path =
			guildId === "@me"
				? `/channels/@me/${channelId}`
				: `/channels/${guildId}/${channelId}`;
		await this.page.evaluate((p: string) => {
			history.pushState({}, "", p);
			window.dispatchEvent(new PopStateEvent("popstate"));
		}, path);
	}

	async sendMessage(
		channelId: string,
		content: string,
		nonce?: string
	): Promise<Response | null> {
		if (!this.page) {
			return null;
		}
		const n =
			nonce ?? String(Date.now()) + String(Math.floor(Math.random() * 100000));
		const resp = await this.page.evaluate(
			async ({ c, content, n }: { c: string; content: string; n: string }) => {
				const r = await window.__puppetFetch(`/api/v9/channels/${c}/messages`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						content,
						nonce: n,
						tts: false,
						flags: 0,
					}),
				});
				return { ok: r.ok, status: r.status, text: await r.text() };
			},
			{ c: channelId, content, n }
		);
		if (!resp.ok) {
			console.error(
				"[discord-client] sendMessage error",
				resp.status,
				resp.text
			);
		}
		return null;
	}

	async editMessage(
		channelId: string,
		messageId: string,
		content: string
	): Promise<Response | null> {
		if (!this.page) {
			return null;
		}
		const resp = await this.page.evaluate(
			async ({ c, m, content }: { c: string; m: string; content: string }) => {
				const r = await window.__puppetFetch(
					`/api/v9/channels/${c}/messages/${m}`,
					{
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ content, flags: 0 }),
					}
				);
				return { ok: r.ok, status: r.status, text: await r.text() };
			},
			{ c: channelId, m: messageId, content }
		);
		if (!resp.ok) {
			console.error(
				"[discord-client] editMessage error",
				resp.status,
				resp.text
			);
		}
		return null;
	}

	async ack(
		channelId: string,
		messageId: string,
		mentionToken: string
	): Promise<void> {
		if (!this.page) {
			return;
		}
		await this.page.evaluate(
			async ({ c, m, t }: { c: string; m: string; t: string }) => {
				await window.__puppetFetch(`/api/v9/channels/${c}/messages/${m}/ack`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ token: t, manual: true }),
				});
			},
			{ c: channelId, m: messageId, t: mentionToken }
		);
	}

	async hookFetch(): Promise<void> {
		if (!this.page) {
			return;
		}
		await this.page.evaluate(() => {
			const orig = window.fetch.bind(window);
			window.__puppetFetch = (url: RequestInfo | URL, opts?: RequestInit) => {
				console.debug("[puppet:fetch]", url, opts?.method ?? "GET");
				return orig(url, opts);
			};
		});
	}

	async destroy(): Promise<void> {
		if (this.browser) {
			await this.browser.close();
			this.browser = null;
			this.page = null;
			this.ready = false;
		}
	}
}
