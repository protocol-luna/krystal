import * as Eris from "eris";
import { DISCORD_TOKEN, pickReplyStyle, spontaneousIntervalMs, spontaneousChance } from "./config.js";
import { askLLM, resetLLM } from "./llm.js";
import { evaluateMessage, isRecentBotActivity, markBotActivity, clearCooldown, type TriggerResult } from "./trigger.js";
import { trySpawn } from "./spontaneous.js";

const client = new Eris.Client(DISCORD_TOKEN, {
  intents: [
    "guilds",
    "guildMessages",
    "messageContent",
    "directMessages",
  ],
});

const followUpTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function triggerLunaReply(message: Eris.Message): Promise<void> {
  let typingInterval: ReturnType<typeof setInterval> | null = null;
  const startTyping = () => {
    client.sendChannelTyping(message.channel.id);
    typingInterval = setInterval(() => {
      client.sendChannelTyping(message.channel.id);
    }, 8000);
  };

  const style = pickReplyStyle(isRecentBotActivity(message.channel.id));

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
            }).then(() => markBotActivity(message.channel.id)),
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
    }).then(() => markBotActivity(message.channel.id));
  }
}

client.on("ready", () => {
  console.log(`Connecté comme ${client.user.username}#${(client.user as Eris.User).discriminator} (Mode CLI Interactif Strict)`);
});

client.on("messageCreate", async (message: Eris.Message) => {
  // Cancel any pending follow-up timer for this channel
  if (followUpTimers.has(message.channel.id)) {
    clearTimeout(followUpTimers.get(message.channel.id)!);
    followUpTimers.delete(message.channel.id);
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

  // Follow-up: if the bot sent a message recently in this channel,
  // the user might be continuing the conversation
  if (isRecentBotActivity(message.channel.id)) {
    const timer = setTimeout(async () => {
      followUpTimers.delete(message.channel.id);
      const followUp = evaluateMessage(message, client.user.id, client.user.username, true);
      if (followUp.shouldRespond) {
        await triggerLunaReply(message);
      }
    }, 4500);

    followUpTimers.set(message.channel.id, timer);
  }
});

export function startBot(): void {
  client.connect();

  setInterval(() => {
    if (Math.random() < spontaneousChance) {
      void trySpawn(client);
    }
  }, spontaneousIntervalMs);
}
