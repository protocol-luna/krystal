import { createInterface } from "node:readline";

const command = process.argv[2];

switch (command) {
	case "bot":
	case undefined: {
		const { startBot } = await import("./bot.js");
		await startBot();
		break;
	}

	case "server": {
		process.env.LLM_MODE = "cli";
		await import("./core/llm-server.js");
		break;
	}

	case "direct": {
		console.log(
			"Direct LLM mode — type messages, /clear to reset, /exit to quit"
		);
		const { askLLM, resetLLM } = await import("./core/llm-core.js");
		const rl = createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		for await (const line of rl) {
			const text = line.trim();
			if (!text) {
				continue;
			}
			if (text === "/exit") {
				break;
			}
			if (text === "/clear") {
				await resetLLM();
				continue;
			}
			const reply = await askLLM(
				{ username: "user", text },
				{ onChunk: (c) => process.stdout.write(`${c} `) }
			);
			console.log(`\n${reply}\n`);
		}
		break;
	}

	default: {
		console.error("Usage: node self-cli.js [bot|server|direct]");
		process.exit(1);
	}
}
