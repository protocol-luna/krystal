import * as Eris from "eris";
import { DISCORD_TOKEN } from "./config.js";
import { askLLM, resetLLM } from "./llm.js";

const client = new Eris.Client(DISCORD_TOKEN, {
  intents: [
    "guilds",
    "guildMessages",
    "messageContent",
    "directMessages",
  ],
});

const messageWait = new Map<string, ReturnType<typeof setTimeout>>();

function splitMessage(text: string, max = 2000): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    if ((`${current}\n${line}`).length > max) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) { chunks.push(current); }
  return chunks;
}

async function triggerLunaReply(message: Eris.Message): Promise<void> {
  let typingInterval: ReturnType<typeof setInterval> | null = null;
  const startTyping = () => {
    client.sendChannelTyping(message.channel.id);
    typingInterval = setInterval(() => {
      client.sendChannelTyping(message.channel.id);
    }, 8000);
  };

  try {
    const content = message.content
      .replace(new RegExp(`<@!?${client.user.id}>`, "g"), "")
      .trim();

    const displayName = (message.member as Eris.Member | null)?.nick || message.author.username;

    const reply = await askLLM({ username: displayName, text: content }, startTyping);
    if (typingInterval) { clearInterval(typingInterval); }

    const chunks = splitMessage(reply);
    for (let i = 0; i < chunks.length; i++) {
      await client.createMessage(message.channel.id, {
        content: chunks[i],
        messageReference: { messageID: message.id },
        allowedMentions: { repliedUser: false },
      });
    }
  } catch (err) {
    if (typingInterval) { clearInterval(typingInterval); }
    console.error(err);
    await client.createMessage(message.channel.id, {
      content: `Erreur interne avec le processus llama-cli : ${(err as Error).message}`,
      messageReference: { messageID: message.id },
    });
  }
}

client.on("ready", () => {
  console.log(`Connecté comme ${client.user.username}#${(client.user as Eris.User).discriminator} (Mode CLI Interactif Strict)`);
});

client.on("messageCreate", async (message: Eris.Message) => {
  if (message.author.bot) { return; }

  if (messageWait.has(message.channel.id)) {
    clearTimeout(messageWait.get(message.channel.id)!);
    messageWait.delete(message.channel.id);
  }

  const isMentioned = message.mentions.some((u) => u.id === client.user.id);
  const isDM = message.channel.type === 1;
  const guild = (message.channel as Eris.GuildTextableChannel).guild;
  const botMember = guild?.members?.get(client.user.id);
  const botName = botMember?.nick || client.user.username;
  const hasBotName = message.content.toLowerCase().includes(botName.toLowerCase());
  const hasPixie = message.content.toLowerCase().includes("pixie");
  const isMe = client.user.id === message.author.id;

  if (message.content === "-clear") {
    console.log("Commande -clear reçue.");
    resetLLM();
    await client.createMessage(message.channel.id, "Historique et mémoire effacés !");
    return;
  }

  if (!isMe && (isMentioned || isDM || hasBotName || hasPixie)) {
    await triggerLunaReply(message);
  } else {
    try {
      const messages = await client.getMessages(message.channel.id, { limit: 2 }) as Eris.Message[];
      const currentMsg = messages[0];
      const prevMsg = messages[1];

      if (prevMsg && prevMsg.author.id === client.user.id && currentMsg.author.id === message.author.id) {
        const timer = setTimeout(async () => {
          messageWait.delete(message.channel.id);
          await triggerLunaReply(message);
        }, 4500);

        messageWait.set(message.channel.id, timer);
      }
    } catch (e) {
      console.error("Erreur lors du fetch de l'historique court :", e);
    }
  }
});

export function startBot(): void {
  client.connect();
}
