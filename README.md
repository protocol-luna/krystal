# pixieglow — Discord LLM Bot

Bot Discord autonome qui fait tourner un LLM local (llama.cpp) et converse de façon naturelle en serveur et en DM. Le modèle est fine-tuné sur [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) pour produire des échanges réalistes.

## Architecture

```
┌─────────────────┐   NDJSON/HTTP    ┌──────────────────────┐
│  llm-server.ts  │ ◄──────────────► │      bot client      │
│  (port 3124)    │   POST /ask       │    (Eris / Discord)  │
│                 │   POST /reset     │                      │
│  llama-cli      │   GET /health     │  trigger.ts          │
│  process        │                   │  mannerisms.ts       │
└─────────────────┘                   │  spontaneous.ts     │
                                      └──────────────────────┘
```

Deux processus séparés — le LLM (llama-cli avec chargement du modèle) et le client Discord (hot-reloadable sans recharger le modèle). Communication en NDJSON streamé sur HTTP.

**Pourquoi NDJSON plutôt que SSE ?** Plus simple à parser ligne par ligne, chaque ligne est un JSON complet.

## Dataset

Le modèle utilisé est fine-tuné sur [**Discord-Dialogues**](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) — un dataset de conversations Discord réelles, avec pseudos, langage naturel, emojis et slapements. Le bot est prévu pour tourner sur un GGUF quantifié (ex. `Discord-Hermes-3-8B.Q3_K_M.gguf`).

---

## Système de déclenchement

### State machine — décision message entrant

```mermaid
stateDiagram-v2
    state "Message reçu" as received
    state "Skip bot" as skipbot
    state "Commande ?" as cmd
    state "Évaluation" as eval
    state "Ignore ?" as ignore
    state "Délai + Réaction" as prereply
    state "Réponse LLM" as reply
    state "Follow-up ?" as followup
    state "Track speaker" as track

    received --> skipbot : author = bot ?
    skipbot --> [*] : oui (return)

    skipbot --> cmd : non
    cmd --> stop : -stop
    cmd --> start : -start
    cmd --> clear : -clear
    cmd --> eval : autre

    stop --> [*]
    start --> [*]
    clear --> [*]

    eval --> mention : @bot
    eval --> dm : DM + replyInDM
    eval --> paused : bot en pause
    eval --> cooldown : cooldown actif
    eval --> name : nom du bot détecté
    eval --> keyword : mot-clé détecté
    eval --> followup : follow-up actif
    eval --> random : 1.5% chance
    eval --> track : aucun trigger

    mention --> prereply
    dm --> prereply
    name --> prereply
    keyword --> prereply
    random --> prereply

    prereply --> ignore : roll < chance
    ignore --> [*] : ignoré
    prereply --> reply : pas ignoré

    reply --> track
    reply --> [*]

    track --> canFollowup : bot dernier speaker + actif < 15s ?
    canFollowup --> prereply : oui → follow-up immédiat
    canFollowup --> track : non
    track --> [*]
```

### Ordre de priorité des déclencheurs

| # | Raison | Conditions | Bypass ignore | Bypass pause |
|---|---|---|---|---|
| 1 | `mention` | Le bot est `@mentionné` | Oui (0%) | Oui |
| 2 | `dm` | Message privé avec `replyInDM = true` | Oui (0%) | Non |
| 3 | `name` | Message contient "Luna", "Pixie" ou le pseudo du bot (mot entier) | Non (8%) | Non |
| 4 | `keyword` | Message contient un mot-clé (mot entier) : `hello`, `hi`, `hey`, `yo`, `ai`, `bot`... | Non (8%) | Non |
| 5 | `follow-up` | Bot était le dernier interlocuteur + activité < 15s + < 3 follow-up / 60s | — | — |
| 6 | `random` | 1.5% de chance sur chaque message qui n'a pas matché | Non (8%) | Non |

**Mot entier (`\b`)** : "ai" ne matche pas "mais", "vrai", "lait". Seul le mot isolé "ai" ou "AI" déclenche.

### Cooldown

8 secondes entre deux réponses dans un même salon. Bypassé par les mentions et les follow-up.

### Follow-up

Quand le bot répond, il s'enregistre comme `lastSpeaker`. Tout message suivant dans les 15s déclenche une réponse immédiate (sans timer, sans check de mot-clé). Budget : 3 follow-up par fenêtre de 60s (via `responseCount` décrémenté après 60s).

---

## Mécanismes de réponse

### Délai variable

```
delay = 800 + random(0, 3200) ms
```

Simule le temps de réflexion. Aucun typing pendant ce délai — le typing n'apparaît que quand le LLM commence à générer (premier token reçu).

### Ignore chance

8% des triggers non-mention/non-DM sont ignorés (simule l'inattention humaine). 0% pour les mentions et DMs.

### Réactions

6% de chance. Quand le bot réagit :
- 30% → émoji personnalisé du serveur (aléatoire parmi les emojis du guild)
- 70% → émoji unicode depuis une liste prédéfinie

### Typing indicator

```typescript
onFirstToken: startTyping   → envoie typing + intervalle 8s
finally: clearInterval      → arrête le typing
```

### Réponse multi-chunk

Le LLM stream sa réponse en chunks (découpés sur les `\n`). Chaque chunk devient un message Discord séparé. Seul le premier message a un `messageReference` (reply visuel).

### Reply style

Pondéré selon que le salon est en "conversation active" (bot a parlé récemment) ou non :

| Contexte | `messageReference` | `mentionRepliedUser` | Poids |
|---|---|---|---|
| Froid | `true` | `false` | 70% |
| Froid | `true` | `true` | 20% |
| Froid | `false` | `false` | 10% |
| Actif | `true` | `false` | 50% |
| Actif | `true` | `true` | 15% |
| Actif | `false` | `false` | 30% |
| Actif | `false` | `true` | 5% |

En DM, `messageReference` est toujours `false`.

### Messages spontanés

Toutes les 5 minutes, 12% de chance que le bot poste un message de son propre chef.

```mermaid
flowchart LR
    A[Timer 5min] --> B{12% ?}
    B -- non --> A
    B -- oui --> C{LLM busy ?}
    C -- oui --> A
    C -- non --> D[Pick weighted guild]
    D --> E[Find most active channel]
    E --> F[Fetch recent context]
    F --> G[Reset LLM context]
    G --> H[Ask LLM: join conversation]
    H --> I{Send ?}
    I -- vide --> A
    I -- message --> J[markBotActivity]
    J --> K[Reset LLM context]
    K --> A
```

**Sélection du serveur** : classement par `lastMessageID` du salon le plus actif, poids linéaire décroissant (le serveur le plus actif a N× plus de chances que le dernier).

---

## Commandes

| Commande | Effet |
|---|---|
| `-stop` | Pause tous les déclencheurs, reset le contexte LLM, vide les cooldowns |
| `-start` | Réactive le bot |
| `-clear` | Reset l'historique de conversation du salon + cooldowns + follow-up |

---

## Configuration

### `.env`

| Variable | Défaut | Description |
|---|---|---|
| `DISCORD_TOKEN` | — | Token du bot Discord (obligatoire) |
| `LLAMA_CLI_PATH` | `../llama-b9682/llama-cli` | Chemin vers l'exécutable `llama-cli` |
| `LLAMA_MODEL_PATH` | `./models/*.gguf` | Chemin du modèle GGUF |
| `PORT` | `3124` | Port du serveur LLM HTTP |

### `prompt.txt`

Fichier lu au démarrage, contient le system prompt :

```
Your name is pixieglow. You are a 21-year-old girl studying art.
Talk naturally and never prefix your replies with your name.
```

### Paramètres LLM (llama-cli)

```yaml
temp: 0.75
dynatemp-range: 0.15
top-k: 40
top-p: 0.95
min-p: 0.05
repeat-penalty: 1.12
repeat-last-n: 256
presence-penalty: 0.1
```

Chat template : ChatML (`<|im_start|>/<|im_end|>`)

---

## Logs

Le bot trace toutes ses décisions avec des préfixes filtrables :

| Préfixe | Information |
|---|---|
| `[trigger]` | Évaluation de chaque message, résultat (`→ name`, `→ keyword`, `→ rien`...) |
| `[trigger]` | `canFollowUp=` avec les raisons (recentBot, lastSpeaker, followCount) |
| `[mannerisms]` | Délai calculé, rolls d'ignore/réaction avec la valeur |
| `[bot]` | Décision de répondre, follow-up immédiat, reply style choisi |
| `[spontaneous]` | Message spontané envoyé ou réponse vide |
| `[eris]` | Erreurs de la librairie Discord (attrapées sans crash) |

---

## Setup

```bash
# Cloner et installer
npm install

# Configuration
cp .env.example .env
# éditer DISCORD_TOKEN dans .env

# System prompt
echo "Your name is pixieglow. You are a 21-year-old girl studying art." > prompt.txt

# Lancer en dev
npm run dev

# Build + production
npm run build
npm start
```

### Scripts npm

| Script | Description |
|---|---|
| `npm run dev` | LLM server (hot) + esbuild watch + bot client (watch) |
| `npm run start` | LLM server + bot client (production) |
| `npm run build` | Bundle le bot avec esbuild → `self-cli.js` |
| `npm run client-only` | Build watch + bot client (sans LLM server) |
| `npm run server-only` | LLM server uniquement |
| `npm run lint` | Biome lint |
| `npm run format` | Biome format |

---

## Portail Développeur Discord

- Activer **Message Content Intent** (onglet Bot)
- Inviter avec scope `bot` + permissions `Send Messages`, `Read Message History`, `Add Reactions`
- Gateway intents : `guilds`, `guildMessages`, `messageContent`, `directMessages`

---

## Structure du projet

```
src/
├── index.ts          # Point d'entrée (import startBot)
├── bot.ts            # Client Eris, message handler, triggerLunaReply
├── config.ts         # Toute la configuration (env, triggers, LLM, styles)
├── trigger.ts        # Évaluation des messages, cooldowns, follow-up
├── mannerisms.ts     # Délai, ignore, réactions
├── spontaneous.ts    # Messages spontanés pondérés
├── guild.ts          # findMostActiveChannel helper
├── llm-server.ts     # Serveur HTTP NDJSON, spawn llama-cli, queue
├── llm-client.ts     # Client HTTP vers le serveur LLM
└── llm.ts            # Ancienne version monolithique (archivée)
```

### Flux détaillé d'une réponse

```mermaid
sequenceDiagram
    participant User
    participant Discord
    participant bot.ts
    participant trigger.ts
    participant mannerisms.ts
    participant llm-client.ts
    participant llm-server.ts
    participant llama

    User->>Discord: envoie un message
    Discord->>bot.ts: messageCreate
    bot.ts->>trigger.ts: evaluateMessage()
    trigger.ts-->>bot.ts: { shouldRespond, reason }

    alt shouldRespond = true
        bot.ts->>trigger.ts: markReplied() + trackSpeaker()
        bot.ts->>mannerisms.ts: shouldIgnore()
        alt ignoré
            mannerisms.ts-->>bot.ts: true → return
        else pas ignoré
            bot.ts->>mannerisms.ts: computeDelay()
            mannerisms.ts-->>bot.ts: delay ms
            bot.ts-->>bot.ts: attend delay
            bot.ts->>mannerisms.ts: shouldReact() + pickReaction()
            alt réaction
                bot.ts->>Discord: addReaction()
            end
            bot.ts->>llm-client.ts: askLLM()
            llm-client.ts->>llm-server.ts: POST /ask (NDJSON)
            llm-server.ts->>llama: stdin (prompt)
            llama-->>llm-server.ts: stdout stream
            llm-server.ts-->>llm-client.ts: NDJSON stream
            llm-client.ts-->>bot.ts: onFirstToken()
            bot.ts->>Discord: sendChannelTyping()
            loop every 8s
                bot.ts->>Discord: sendChannelTyping()
            end
            loop each chunk
                llm-client.ts-->>bot.ts: onChunk(chunk)
                bot.ts->>Discord: createMessage(chunk)
                bot.ts->>trigger.ts: markBotActivity()
            end
            bot.ts->>trigger.ts: trackSpeaker(bot)
        end
    else shouldRespond = false
        bot.ts->>trigger.ts: canFollowUp()
        alt follow-up
            bot.ts->>trigger.ts: markReplied()
            bot.ts->>mannerisms.ts: computeDelay()
            bot.ts->>Discord: (delay, réaction, réponse...)
        else
            bot.ts->>trigger.ts: trackSpeaker(user)
        end
    end
```
