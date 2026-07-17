import puppeteer from "puppeteer";

const browser = await puppeteer.launch({
	headless: false,
	userDataDir: "./chrome-profile",
	args: [
		"--disable-blink-features=AutomationControlled",
		"--no-sandbox",
		`--window-size=1280,720`,
	],
});

const [page] = await browser.pages();
const cdp = await page.target().createCDPSession();
await cdp.send("Network.enable");

// 1. Attente connexion utilisateur (QR code)
try {
	await page.goto("https://discord.com/channels/@me", {
		waitUntil: "domcontentloaded",
	});
} catch {
	/* ignore timeout on initial load */
}
console.log("[puppet] Connecte-toi via QR code dans la fenetre Chrome...");
await page.waitForSelector('[data-list-item-id="guildsnav___home"]', {
	timeout: 120_000,
});
console.log("[puppet] Connecte !");

// 2. Hook Gateway via CDP — récupère mention_token + t
cdp.on("Network.webSocketFrameReceived", ({ response }) => {
	const data = JSON.parse(response.payloadData);
	if (data.t) {
		emit("gateway", { event: data.t, data: data.d });
	}
});

// 3. Injecte un relais fetch → Node (ACK, send, edit natifs)
await page.evaluate(() => {
	const origFetch = window.fetch.bind(window);
	window.__puppetFetch = origFetch;
	window.__puppetSend = (url, opts) => {
		console.log("[puppet:fetch]", url, opts?.method ?? "GET");
		return origFetch(url, opts);
	};
});

// 4. Navigation par history.pushState + popstate
async function navigateTo(guildId, channelId) {
	await page.evaluate(
		({ guild, channel }) => {
			const path = guild === "@me"
				? `/channels/@me/${channel}`
				: `/channels/${guild}/${channel}`;
			history.pushState({}, "", path);
			window.dispatchEvent(new PopStateEvent("popstate"));
		},
		{ guild: guildId, channel: channelId },
	);
}

// 5. ACK via le fetch natif de la page (headers réels, cookies réels, fingerprint réel)
async function ack(channelId, messageId, mentionToken) {
	return page.evaluate(
		({ c, m, t }) =>
			window.__puppetFetch(`/api/v9/channels/${c}/messages/${m}/ack`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token: t, manual: true }),
			}),
		{ c: channelId, m: messageId, t: mentionToken },
	);
}

// 6. Send via le fetch natif
async function sendMessage(channelId, content, nonce) {
	return page.evaluate(
		({ c, content, nonce }) =>
			window.__puppetFetch(`/api/v9/channels/${c}/messages`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					content,
					nonce,
					tts: false,
					flags: 0,
				}),
			}),
		{ c: channelId, content, nonce },
	);
}

// 7. Edit via le fetch natif
async function editMessage(channelId, messageId, content) {
	return page.evaluate(
		({ c, m, content }) =>
			window.__puppetFetch(`/api/v9/channels/${c}/messages/${m}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content, flags: 0 }),
			}),
		{ c: channelId, m: messageId, content },
	);
}

// --- Exemple d'utilisation ---
// navigue dans un salon
await navigateTo("123456789", "987654321");

// écoute les messages entrants et ACK automatiquement
process.on("gateway", ({ event, data }) => {
	if (event === "MESSAGE_CREATE") {
		const { channel_id, id, mention_token } = data;
		if (mention_token) {
			setTimeout(() => ack(channel_id, id, mention_token), 200 + Math.random() * 300);
		}
	}
});

// Garde le processus vivant
await new Promise(() => {});
