import * as Eris from "eris";
import { DISCORD_TOKEN, pickReplyStyle, spontaneousIntervalMs, spontaneousChance } from "./config.js";
import { askLLM, resetLLM } from "./llm-client.js";
import { evaluateMessage, isRecentBotActivity, markBotActivity, clearCooldown, trackSpeaker, canFollowUp, setPaused, type TriggerResult } from "./trigger.js";
import { trySpawn } from "./spontaneous.js";
import { computeDelay, shouldIgnore, shouldReact, pickReaction } from "./mannerisms.js";

const followUpTimers = new Map<string, ReturnType<typeof setTimeout>>();

const client = new Eris.Client(DISCORD_TOKEN, {
  intents: [
    "guilds",
    "guildMessages",
    "messageContent",
    "directMessages",
  ],
});

async function triggerLunaReply(message: Eris.Message): Promise<void> {
  let typingInterval: ReturnType<typeof setInterval> | null = null;
  const startTyping = () => {
    client.sendChannelTyping(message.channel.id);
    typingInterval = setInterval(() => {
      client.sendChannelTyping(message.channel.id);
    }, 8000);
  };

  const style = pickReplyStyle(isRecentBotActivity(message.channel.id));
  console.log(`[bot] replyStyle: messageReference=${style.messageReference} mentionRepliedUser=${style.mentionRepliedUser}`);

  try {
    const content = message.content
      .replace(new RegExp(`<@!?${client.user.id}>`, "g"), "")
      .trim();

    const displayName = (message.member as Eris.Member | null)?.nick || message.author.username;

    let sendChain: Promise<unknown> = Promise.resolve();
    let isFirstChunk = true;

    await askLLM(
      { username: displayName, text: content },
      {
        onFirstToken: startTyping,
        onChunk: (chunk: string) => {
          sendChain = sendChain.then(() =>
            client.createMessage(message.channel.id, {
              content: chunk,
              ...(isFirstChunk && style.messageReference
                ? { messageReference: { messageID: message.id }, allowedMentions: { repliedUser: style.mentionRepliedUser } }
                : {}),
            }).then(() => { isFirstChunk = false; markBotActivity(message.channel.id); }),
          );
        },
      },
    );

    await sendChain;
    trackSpeaker(message.channel.id, client.user.id);
  } catch (err) {
    console.error(err);
    await client.createMessage(message.channel.id, {
      content: `Erreur interne avec le processus llama-cli : ${(err as Error).message}`,
      ...(style.messageReference
        ? { messageReference: { messageID: message.id }, allowedMentions: { repliedUser: style.mentionRepliedUser } }
        : {}),
    }).then(() => markBotActivity(message.channel.id));
  } finally {
    if (typingInterval) { clearInterval(typingInterval); }
  }
}

client.on("ready", () => {
  console.log(`Connecté comme ${client.user.username}#${(client.user as Eris.User).discriminator} (Mode CLI Interactif Strict)`);
});

client.on("messageCreate", async (message: Eris.Message) => {
  if (message.author.id === client.user.id) { return; }

  const author = message.member?.nick || message.author.username;
  const channel = message.channel as Eris.GuildTextableChannel;

  if (followUpTimers.has(message.channel.id)) {
    clearTimeout(followUpTimers.get(message.channel.id)!);
    followUpTimers.delete(message.channel.id);
    console.log(`[bot] #${channel.name ?? message.channel.id} followUpTimer annulé (nouveau message)`);
  }

  const result: TriggerResult = evaluateMessage(
    message,
    client.user.id,
    client.user.username,
  );

  if (result.reason === "stop") {
    console.log(`[bot] #${channel.name ?? message.channel.id} ${author}: -stop → pause`);
    await resetLLM();
    clearCooldown(message.channel.id);
    trackSpeaker(message.channel.id, message.author.id);
    setPaused(true);
    await client.createMessage(message.channel.id, "⏸️  Bot mis en pause. Envoie `-start` pour réactiver.");
    return;
  }

  if (result.reason === "start") {
    console.log(`[bot] #${channel.name ?? message.channel.id} ${author}: -start → reprise`);
    setPaused(false);
    await client.createMessage(message.channel.id, "▶️  Bot réactivé !");
    return;
  }

  if (result.reason === "clear") {
    console.log(`[bot] #${channel.name ?? message.channel.id} ${author}: -clear → reset`);
    await resetLLM();
    clearCooldown(message.channel.id);
    trackSpeaker(message.channel.id, message.author.id);
    await client.createMessage(message.channel.id, "🧹  Historique et mémoire effacés !");
    return;
  }

  if (result.shouldRespond) {
    trackSpeaker(message.channel.id, message.author.id);
    if (shouldIgnore(result.reason)) {
      console.log(`[bot] #${channel.name ?? message.channel.id} ${author}: ignoré (${result.reason})`);
      return;
    }

    const delay = computeDelay();
    console.log(`[bot] #${channel.name ?? message.channel.id} ${author}: répond (${result.reason}) delay=${delay.toFixed(0)}ms`);
    await new Promise((r) => setTimeout(r, delay));

    if (shouldReact()) {
      const guild = (channel as Eris.GuildTextableChannel).guild;
      const serverEmojis = guild?.emojis
        ?.filter((e) => e.id)
        .map((e) => `${e.animated ? "a:" : ""}${e.name}:${e.id}`);
      const reaction = pickReaction(serverEmojis);
      await message.addReaction(reaction).catch(() => {});
    }

    await triggerLunaReply(message);
    return;
  }

  if (canFollowUp(message.channel.id, client.user.id)) {
    trackSpeaker(message.channel.id, message.author.id);
    console.log(`[bot] #${channel.name ?? message.channel.id} followUpTimer armé (4.5s)`);
    const timer = setTimeout(async () => {
      followUpTimers.delete(message.channel.id);
      console.log(`[bot] #${channel.name ?? message.channel.id} followUpTimer déclenché`);
      const followUp = evaluateMessage(message, client.user.id, client.user.username, true);
      if (followUp.shouldRespond) {
        console.log(`[bot] #${channel.name ?? message.channel.id} followUp → réponse`);
        await triggerLunaReply(message);
      }
    }, 4500);

    followUpTimers.set(message.channel.id, timer);
  } else {
    trackSpeaker(message.channel.id, message.author.id);
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
