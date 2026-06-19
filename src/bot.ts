import * as Eris from "eris";
import { DISCORD_TOKEN, pickReplyStyle } from "./config.js";
import { askLLM, resetLLM } from "./llm.js";
import { evaluateMessage, isFollowUpMessage, clearCooldown, type TriggerResult } from "./trigger.js";

const client = new Eris.Client(DISCORD_TOKEN, {
  intents: [
    "guilds",
    "guildMessages",
    "messageContent",
    "directMessages",
  ],
});

const messageWait = new Map<string, ReturnType<typeof setTimeout>>();

async function triggerLunaReply(message: Eris.Message): Promise<void> {
  let typingInterval: ReturnType<typeof setInterval> | null = null;
  const startTyping = () => {
    client.sendChannelTyping(message.channel.id);
    typingInterval = setInterval(() => {
      client.sendChannelTyping(message.channel.id);
    }, 8000);
  };

  const style = pickReplyStyle();

  try {
    const content = message.content
      .replace(new RegExp(`<@!?${client.user.id}>`, "g"), "")
      .trim();

    const displayName = (message.member as Eris.Member | null)?.nick || message.author.username;

    let sendChain: Promise<unknown> = Promise.resolve();

    await askLLM(
      { username: displayName, text: content },
      {
        onFirstToken: startTyping,
        onChunk: (chunk: string) => {
          sendChain = sendChain.then(() =>
            client.createMessage(message.channel.id, {
              content: chunk,
              ...(style.messageReference
                ? { messageReference: { messageID: message.id }, allowedMentions: { repliedUser: style.mentionRepliedUser } }
                : {}),
            }),
          );
        },
      },
    );

    await sendChain;
  } catch (err) {
    if (typingInterval) { clearInterval(typingInterval); }
    console.error(err);
    await client.createMessage(message.channel.id, {
      content: `Erreur interne avec le processus llama-cli : ${(err as Error).message}`,
      ...(style.messageReference
        ? { messageReference: { messageID: message.id }, allowedMentions: { repliedUser: style.mentionRepliedUser } }
        : {}),
    });
  }
}

client.on("ready", () => {
  console.log(`Connecté comme ${client.user.username}#${(client.user as Eris.User).discriminator} (Mode CLI Interactif Strict)`);
});

client.on("messageCreate", async (message: Eris.Message) => {
  if (messageWait.has(message.channel.id)) {
    clearTimeout(messageWait.get(message.channel.id)!);
    messageWait.delete(message.channel.id);
  }

  const result: TriggerResult = evaluateMessage(
    message,
    client.user.id,
    client.user.username,
  );

  if (result.reason === "clear") {
    console.log("Commande -clear reçue.");
    resetLLM();
    clearCooldown(message.channel.id);
    await client.createMessage(message.channel.id, "Historique et mémoire effacés !");
    return;
  }

  if (result.shouldRespond) {
    await triggerLunaReply(message);
    return;
  }

  // Follow-up detection: if the bot replied last, set a timer
  try {
    const messages = await client.getMessages(message.channel.id, { limit: 2 }) as Eris.Message[];
    const prevMsg = messages[1];

    if (isFollowUpMessage(prevMsg, message, client.user.id)) {
      const timer = setTimeout(async () => {
        messageWait.delete(message.channel.id);
        const followUp = evaluateMessage(message, client.user.id, client.user.username, true);
        if (followUp.shouldRespond) {
          await triggerLunaReply(message);
        }
      }, 4500);

      messageWait.set(message.channel.id, timer);
    }
  } catch (e) {
    console.error("Erreur lors du fetch de l'historique court :", e);
  }
});

export function startBot(): void {
  client.connect();
}
