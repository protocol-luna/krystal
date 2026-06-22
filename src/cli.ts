async function main(): Promise<void> {
	const command = process.argv[2];

	switch (command) {
		case "bot":
		case undefined: {
			const { startBot } = await import("./bot.js");
			await startBot();
			break;
		}

		default: {
			console.error("Usage: node self-cli.js [bot]");
			process.exit(1);
		}
	}
}

void main();

export {};
