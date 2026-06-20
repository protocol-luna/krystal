# pixieglow — Discord LLM Bot

Bot Discord autonome qui fait tourner un LLM local (llama.cpp) et converse de façon naturelle en serveur et en DM. Le modèle est fine-tuné sur [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) pour produire des échanges réalistes.

## Architecture

```
┌─────────────────┐   NDJSON/HTTP    ┌──────────────────────────┐
│  core/          │ ◄──────────────► │         bot client       │
│  llm-server.ts  │   POST /ask       │    (Eris / Discord)      │
│  (port 3124)    │   POST /reset     │                          │
│                 │   GET /health     │  bot/bot.ts              │
│  llama-cli      │                   │  bot/pending.ts          │
│  process        │                   │  bot/reactions.ts        │
│  (auto-restart) │                   │  state/trigger.ts        │
└─────────────────┘                   │  state/state.ts          │
                                      │  behavior/mannerisms.ts  │
                                      │  spontaneous.ts          │
                                      └──────────────────────────┘
```

Deux processus séparés — le LLM (llama-cli avec chargement du modèle) et le client Discord (hot-reloadable sans recharger le modèle). Communication en NDJSON streamé sur HTTP.

**Auto-restart** : si le processus llama-cli crash, il est automatiquement relancé avec la file d'attente préservée.

**Pourquoi NDJSON plutôt que SSE ?** Plus simple à parser ligne par ligne, chaque ligne est un JSON complet.

## Dataset

Le modèle utilisé est fine-tuné sur [**Discord-Dialogues**](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) — **7.3M échanges**, **16.9M turns**, **140M mots**, collectés sur Discord printemps-été 2025. Conversations humaines réelles filtrées (PII, ToS, bots, commandes). Licence Apache 2.0.

```mermaid
xychart-beta
  title "Distribution du nombre de turns par échange"
  x-axis ["2", "3", "4", "5", "6", "7+"]
  y-axis "Échanges (millions)" 0 --> 6
  bar [5.80, 1.04, 0.30, 0.10, 0.04, 0.04]
```

| Métrique | Valeur |
|---|---|
| Échantillons | 7 303 464 |
| Turns total | 16 881 010 |
| Mots total | 139 922 950 |
| Tokens moyen | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

Le bot est prévu pour tourner sur un GGUF quantifié (ex. `Discord-Hermes-3-8B.Q3_K_M.gguf`).

<img width="823" height="784" alt="image" src="https://github.com/user-attachments/assets/89493037-37a2-477c-8c7d-4a6a6016f003" />

---

## 👀 Vue d'ensemble simplifiée

```mermaid
flowchart TD
    A["💬 Quelqu'un envoie\nun message"] --> B{"📋 C'est une\ncommande ?"}
    B -- "❌ ▶️ 🗑️" --> C["✅ Hop, exécuté\nen silence"]
    B -- "non" --> D{"😴 Le bot\ndort ?"}
    D -- "oui 🌙" --> E["🙈 Ignoré\n(sauf mention)"]
    D -- "non" --> F{"🎯 Le bot est\nconcerné ?"}
    F -- "non" --> G["👋 Pas répondu\n(pas pour lui)"]
    F -- "oui" --> H["⏳ Attend un peu\n(et réagit peut-être)"]
    H --> I["✍️ Tape la réponse\nen plusieurs messages"]
    I --> J{"🗣️ Réponse\nvocale ?"}
    J -- "oui" --> K["🎵 Envoie un\nmessage vocal"]
    J -- "non" --> L["💬 Continue\n(avec fautes, délais...)"]
    K --> M["✔️ Fini !"]
    L --> M
```

---

## Système de déclenchement

### State machine — décision message entrant

```mermaid
stateDiagram-v2
    state "Message reçu" as received
    state "Skip bot" as skipbot
    state "Commande texte ?" as cmd_txt
    state "Réaction commande ?" as cmd_rct
    state "Évaluation" as eval
    state "Sommeil ?" as sleep
    state "Ignore ?" as ignore
    state "Délai + Réaction" as prereply
    state "Réponse LLM" as reply
    state "Follow-up ?" as followup
    state "Track speaker" as track

    received --> skipbot : author = bot ?
    skipbot --> [*] : oui (return)

    skipbot --> cmd_txt : non
    cmd_txt --> stop : "-stop"
    cmd_txt --> start : "-start"
    cmd_txt --> clear : "-clear"
    cmd_txt --> cmd_rct : autre

    cmd_rct --> stop : ❌ réaction
    cmd_rct --> start : ▶️ réaction
    cmd_rct --> clear : 🗑️ réaction
    cmd_rct --> eval : autre / pas une réaction

    stop --> [*] : ✅ silencieux
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

    mention --> sleep
    dm --> sleep
    name --> sleep
    keyword --> sleep
    random --> prereply

    sleep --> prereply : sleep=off\nou sleep=slow\nou mention/dm
    sleep --> [*] : sleep mode + pas mention/dm

    prereply --> ignore : roll < chance
    ignore --> [*] : ignoré
    prereply --> reply : pas ignoré

    reply --> track
    reply --> [*]

    track --> canFollowup : bot dernier speaker + actif < 15s ?
    canFollowup --> prereply : oui → follow-up immédiat\n(ignoré si sleep mode)
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

Le délai varie selon le type de déclencheur (voir section [Concentration variable](#concentration-variable)). Plus le message sollicite directement le bot, plus il répond vite.

Aucun typing pendant ce délai — le typing n'apparaît que quand le LLM commence à générer (premier token reçu).

### Ignore chance

Probabilité d'ignorer un message malgré un trigger, pour simuler l'inattention humaine. Varie selon le type de déclencheur (voir section [Concentration variable](#concentration-variable)). 0% pour les mentions, DMs et follow-up.

### Réactions

Probabilité variable selon le type de déclencheur (voir section [Concentration variable](#concentration-variable)). Quand le bot réagit :
- 30% → émoji personnalisé du serveur (aléatoire parmi les emojis du guild)
- 70% → émoji unicode depuis une liste prédéfinie

### Typing indicator

```typescript
onFirstToken: startTyping   → envoie typing + intervalle 8s
finally: clearInterval      → arrête le typing
```

### Réponse multi-chunk

Le LLM stream sa réponse en chunks (découpés sur les `\n`). Chaque chunk devient un message Discord séparé, avec un délai proportionnel à la longueur du chunk (`min(délai × length/200, 1)`) entre chaque message — simule le temps d'écrire. Seul le premier message a un `messageReference` (reply visuel). En mode vocal, le typing indicator est désactivé et les chunks sont ignorés.

### Simulation de fautes de frappe

Avec une probabilité configurable (`typo_chance`), le bot introduit une faute de frappe sur une lettre aléatoire d'un des messages (remplacement par une touche adjacente sur le clavier, layout AZERTY ou QWERTY). Après un court délai (2–4s), il corrige la faute — comme un humain qui tape vite et corrige.

Le mode de correction est configurable via `typo_correction_style` :
- `"edit"` — édite le message entier pour le remplacer par la version corrigée.
- `"message"` — envoie un nouveau message avec `mot_corrigé*` (convention humaine standard sur Discord).
- `"mixed"` — 50/50 aléatoire entre les deux (défaut).

```yaml
typo_chance: 0.06
typo_correction_delay_min: 2000
typo_correction_delay_max: 4000
typo_layout: "azerty"
typo_correction_style: "mixed"
```

Exemple de fautes AZERTY : `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

### Messages vocaux (TTS)

Avec une probabilité configurable (`voice_message_chance`), la réponse est envoyée comme **message vocal Discord** au lieu de texte. Le pipeline :

1. Le texte est nettoyé (mentions → `@utilisateur`, URLs supprimées, tronqué à 500 caractères)
2. Synthèse vocale via **Piper TTS** (fichier WAV)
3. Conversion WAV → OGG via `ffmpeg`
4. Mesure de la durée via `ffprobe`
5. Upload sur le CDN Discord (3 étapes : création d'attachment, PUT du fichier, POST du message vocal)

Si le texte contient des emoji ou caractères spéciaux, le bot ignore le TTS et envoie le message en texte normal.

```yaml
voice_message_chance: 0.08
```

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

### Concentration variable

Le bot adapte son comportement (délai, réaction, inattention) selon le type de déclencheur. Plus on s'adresse directement à lui, plus il répond vite et attentivement.

```mermaid
flowchart LR
    A[Trigger reason] --> B{type ?}
    B -- mention --> C["delai 300-1500ms\nignore=0%\nreact=8%"]
    B -- dm --> D["delai 400-1800ms\nignore=0%\nreact=5%"]
    B -- name --> E["delai 800-4000ms\nignore=5%\nreact=6%"]
    B -- keyword --> F["delai 1000-3500ms\nignore=8%\nreact=4%"]
    B -- follow-up --> G["delai 500-2000ms\nignore=0%\nreact=3%"]
    B -- random --> H["delai 1500-5000ms\nignore=15%\nreact=2%"]
    C & D & E & F & G & H --> I[computeDelay\nshouldIgnore\nshouldReact]
```

| Trigger | Délai min | Délai max | Ignore chance | Reaction chance |
|---------|-----------|-----------|---------------|-----------------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

### File d'attente anti-spam

Quand le bot est déjà en train de répondre, les nouveaux messages ne sont pas perdus mais **mis en file d'attente** :

```mermaid
stateDiagram-v2
    state "Message reçu\n(trigger match)" as msg
    state "Clé processing[C:U] ?" as check
    state "En cours" as busy
    state "Disponible" as free
    state "Stocké dans\npendingMessages[C:U]" as queue
    state "Réponse LLM" as reply
    state "Après réponse" as done
    state "pendingMessages[C:U] ?" as drain

    msg --> check
    check --> busy : oui (déjà en cours)
    check --> free : non
    busy --> queue : mis en attente
    queue --> [*]
    free --> reply
    reply --> done
    done --> drain
    drain --> reply : message en attente
    drain --> [*] : rien en attente
```

Chaque clé est `"channelId:userId"` — un utilisateur ne peut avoir qu'un message en attente par salon. Quand la réponse en cours termine, le message en file est traité immédiatement.

### Persistance d'état

Le bot sauvegarde son état dans `state.json` pour survivre aux redémarrages :

```mermaid
flowchart LR
    A[Mutation d'état] --> B[scheduleSave\ndebounce 500ms]
    B --> C[async writeFile\nstate.json]
    D[Démarrage] --> E[loadState async]
    E --> F[restoreState\nstate/state.ts]
    E --> G[récupère messages\nen attente via API]
```

**Ce qui est persisté :**
- `pendingMessages` — file d'attente (channelId, messageId, userId, raison).
- `paused` — état pause.
- Cooldowns, timestamps d'activité, dernier interlocuteur, compteurs de follow-up.

Sauvegardé à chaque mutation (ajout/retrait de la file, pause/dépause, clear) avec un debounce de 500ms pour grouper les changements rapides.

### Auto-restart LLM

Si le processus llama-cli crash (OOM, segfault, etc.), il est automatiquement relancé :

1. Réinitialisation des flags internes (`isModelReady`, `isProcessing`, etc.)
2. La file d'attente (`requestQueue`) est préservée — les requêtes en cours seront retraitées
3. Backup exponentiel : 1s → 2s → 4s → 8s → 16s (max 5 tentatives)
4. Après un redémarrage réussi, le compteur de tentatives est réinitialisé

Utile pour les quantifications agressives (Q2_K) qui peuvent crash sur des prompts complexes.

```yaml
# Pas de configuration nécessaire — activé par défaut
```

### Plages de sommeil

Le bot peut simuler une présence non-24/7. Pendant les heures configurées, son comportement change :

```mermaid
flowchart LR
    A[Message reçu] --> B{Sleep schedule\nenabled ?}
    B -- non --> C[Comportement normal]
    B -- oui --> D{Heure de sommeil ?}
    D -- non --> C
    D -- oui --> E{Sleep behavior ?}
    E -- sleep --> F{Mention ou DM ?}
    F -- oui --> C
    F -- non --> G[Ignoré]
    E -- slow --> H[Délai x3-5\nreact↓]
    E -- short --> I[Ignore chance +30%\nreact↓]
    H --> C
    I --> C
```

| Mode | Effet |
|------|-------|
| `sleep` | Seules les mentions (@bot) et les DMs sont traitées. Tout le reste est ignoré. |
| `slow` | Délais multipliés par 3–5, réactions quasi nulles. Le bot est "endormi mais répond". |
| `short` | Ignore chance augmenté de 30%, réactions quasi nulles. Le bot est "distrait". |

Configurable via `sleep_schedule` dans `config.yml`.

Exemple de timeline sur 24h :

```mermaid
gantt
    title Plages de sommeil (exemple)
    dateFormat HH:mm
    axisFormat %H:%M
    tickInterval 2hour

    section Comportement
    Éveillé        : active, 07:00, 3h
    Court          : short, 10:00, 1h
    Éveillé        : active2, 11:00, 5h
    Lent           : slow, 16:00, 2h
    Éveillé        : active3, 18:00, 4h
    Sommeil        : sleep, 22:00, 9h
```

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

Les commandes sont **invisibles** — pas de message public, juste une ✅ de confirmation.

### Par message texte

| Commande | Effet |
|---|---|
| `-stop` | Pause tous les déclencheurs, reset le contexte LLM, vide les cooldowns |
| `-start` | Réactive le bot |
| `-clear` | Reset l'historique de conversation du salon + cooldowns + follow-up |

### Par réactions

Réagis sur **n'importe quel message du bot** avec :

| Emoji | Effet |
|---|---|
| ❌ | Stop (pause + reset) |
| ▶️ | Start (reprise) |
| 🗑️ | Clear (reset historique) |

En cas d'erreur interne, le bot réagit avec ❌ sur ton message au lieu d'afficher un gros message d'erreur.

---

## Configuration

Deux couches, la YAML écrase les valeurs par défaut, puis `.env` écrase pour les secrets et chemins.

### `config.yml` (recommandé)

Toute la configuration du bot : triggers, mannerisms, styles de reply. Exemple :

```yaml
names:
  - "Luna"
  - "Pixie"

keywords:
  - "hello"
  - "hi"
  - "hey"
  - "ai"
  - "bot"

random_chance: 0.015
cooldown_seconds: 8
reply_in_dm: true

response_delay_min: 800
response_delay_max: 4000

reaction_chance: 0.06
ignore_chance: 0.08

spontaneous_interval_ms: 300000
spontaneous_chance: 0.12
```

Voir le fichier complet à la racine.

### `.env`

| Variable | Défaut | Description |
|---|---|---|
| `DISCORD_TOKEN` | — | Token du bot Discord (obligatoire) |
| `LLAMA_CLI_PATH` | `llama/llama-cli` | Chemin vers l'exécutable `llama-cli` |
| `LLAMA_MODEL_PATH` | `models/Discord-Hermes-3-8B.Q2_K.gguf` | Chemin du modèle GGUF |
| `LLM_PORT` | `3124` | Port du serveur LLM HTTP |

### `prompt.txt`

Fichier lu au démarrage, contient le system prompt. Exemple :

```
Your name is pixieglow. You are a 21-year-old girl studying art.
Talk naturally and never prefix your replies with your name.
```

### Paramètres LLM (llama-cli)

Les flags `-t` / `-tb` (thread count) sont automatiquement détectés via `os.cpus().length`.

```yaml
temp: 0.75
dynatemp-range: 0.15
top-k: 40
top-p: 0.95
min-p: 0.05
repeat-penalty: 1.12
repeat-last-n: 256
presence-penalty: 0.1
batch: 4096
ubatch: 256
context: 4096
```

Chat template : ChatML (`<|im_start|>/<|im_end|>`)

Ces paramètres sont codés en dur dans `src/config.ts` (non modifiables via `config.yml`).

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
| `[eris]` | Erreurs de la librairie Discord (attrapées sans crash, log uniquement) |
| `[tts]` | Synthèse vocale, upload CDN, ou envoi de voice message |
| `[persist]` | Sauvegarde/restauration de l'état du bot (`state.json`) |
| `[llm-core]` | Spawn, crash, redémarrage du processus llama-cli |

---

## Setup

```bash
# Cloner et installer
npm install

# Configuration
cp .env.example .env
# éditer DISCORD_TOKEN dans .env
# éditer config.yml (triggers, mannerisms, LLM, etc.)

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
| `npm run build` | Bundle bot + serveur avec esbuild → `self-cli.js` + `llm-server.js` |
| `npm run build-client` | Bundle bot uniquement |
| `npm run build-server` | Bundle serveur LLM uniquement |
| `npm run client-only` | Build watch + bot client (sans LLM server) |
| `npm run server-only` | LLM server uniquement |
| `npm run lint` | Biome lint |
| `npm run lint:write` | Biome lint avec auto-fix |
| `npm run format` | Biome format |
| `npm run check` | Biome check complet |
| `npm run download-model` | Télécharge le modèle Discord-Hermes-3-8B.Q2_K.gguf depuis HuggingFace |

---

## Portail Développeur Discord

- Activer **Message Content Intent** (onglet Bot)
- Inviter avec scope `bot` + permissions `Send Messages`, `Read Message History`, `Add Reactions`
- Gateway intents : `guilds`, `guildMessages`, `guildMessageReactions`, `messageContent`, `directMessages`

---

## Structure du projet

```
src/
├── index.ts          # Point d'entrée → cli.ts
├── cli.ts            # CLI unifié (bot|server|direct)
├── bot.ts            # Handler principal Eris (allégé)
├── config.ts         # Toute la configuration (env, triggers, LLM, styles)
├── mannerisms.ts     # Délai, ignore, réactions, concentration
├── sleep.ts          # Plages de sommeil (présence variable)
├── typo.ts           # Simulation de fautes de frappe + correction
├── spontaneous.ts    # Messages spontanés pondérés
├── guild.ts          # findMostActiveChannel helper
├── tts.ts            # Synthèse vocale PiperTTS, upload CDN, voice messages
├── llm-client.ts     # Client HTTP vers le serveur LLM
├── llm-server.ts     # Ré-export rétrocompatible vers core/llm-server.ts
├── llm.ts            # Ré-export rétrocompatible vers core/llm-core.ts
├── persistence.ts    # Ré-export rétrocompatible vers state/persistence.ts
├── trigger.ts        # Ré-export rétrocompatible vers state/*
├── core/
│   ├── index.ts      # Barrel export
│   ├── llm-core.ts   # Logique LLM partagée (spawn, queue, parsing, restart)
│   ├── llm-server.ts # Serveur HTTP NDJSON
│   └── llm-direct.ts # Mode CLI direct (standalone)
├── state/
│   ├── index.ts      # Barrel export
│   ├── state.ts      # Cooldowns, activité, suivi conversation
│   ├── trigger.ts    # Évaluation des déclencheurs uniquement
│   └── persistence.ts # Sauvegarde/restauration d'état (async)
└── bot/
    ├── pending.ts     # File d'attente anti-spam (processing + pendingMessages)
    ├── reactions.ts   # Commandes par réactions (❌▶️🗑️)
    └── typo-correction.ts # Correction différée des fautes de frappe
```

### Flux détaillé d'une réponse

```mermaid
sequenceDiagram
    participant User
    participant Discord
    participant bot.ts
    participant state/trigger.ts
    participant state/state.ts
    participant mannerisms.ts
    participant sleep.ts
    participant sleep.ts
    participant typo.ts
    participant llm-client.ts
    participant core/llm-server.ts
    participant llama

    User->>Discord: envoie un message
    Discord->>bot.ts: messageCreate
    bot.ts->>trigger.ts: evaluateMessage()
    trigger.ts-->>bot.ts: { shouldRespond, reason }

    bot.ts->>sleep.ts: getSleepBehavior()
    sleep.ts-->>bot.ts: behavior (sleep/slow/short/null)
    alt sleep mode + pas mention/dm
        bot.ts-->>Discord: ignoré
    end

    alt shouldRespond = true
        bot.ts->>trigger.ts: markReplied() + trackSpeaker()
        bot.ts->>mannerisms.ts: shouldIgnore(reason, sleepBehavior)
        alt ignoré
            mannerisms.ts-->>bot.ts: true → return
        else pas ignoré
            bot.ts->>mannerisms.ts: computeDelay(reason, sleepBehavior)
            mannerisms.ts-->>bot.ts: delay ms
            bot.ts-->>bot.ts: attend delay
            bot.ts->>mannerisms.ts: shouldReact(reason, sleepBehavior) + pickReaction()
            alt réaction
                bot.ts->>Discord: addReaction()
            end

            bot.ts->>bot.ts: check processing["C:U"]
            alt déjà en cours
                bot.ts->>bot.ts: stocke dans pendingMessages["C:U"]
                bot.ts-->>Discord: ignoré (mis en attente)
            else libre
                bot.ts->>llm-client.ts: askLLM({ username, text })
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
                    bot.ts->>bot.ts: délai inter-chunk
                    bot.ts->>bot.ts: typo possible (applyTypo)
                    bot.ts->>Discord: createMessage(chunk)
                    bot.ts->>trigger.ts: markBotActivity()
                end
                alt typo appliqué
                    alt style = "edit"
                        bot.ts->>Discord: editMessage (correction après 2-4s)
                    else style = "message"
                        bot.ts->>Discord: createMessage("mot_corrigé*")
                    end
                end
                alt erreur LLM
                    bot.ts-->>bot.ts: console.error(err)
                    bot.ts->>Discord: addReaction("❌")
                end
                bot.ts->>trigger.ts: trackSpeaker(bot)
                bot.ts->>bot.ts: pendingMessages["C:U"] ?
                alt message en attente
                    bot.ts->>bot.ts: triggerLunaReply(msg en attente)
                end
            end
        end
    else shouldRespond = false
        bot.ts->>trigger.ts: canFollowUp()
        alt follow-up
            bot.ts->>trigger.ts: markReplied()
            bot.ts->>mannerisms.ts: computeDelay("follow-up", sleepBehavior)
            bot.ts->>mannerisms.ts: shouldReact("follow-up", sleepBehavior)
            bot.ts->>Discord: (delay, réaction, réponse...)
        else
            bot.ts->>trigger.ts: trackSpeaker(user)
    end
end
```

### Flux commandes par réactions

```mermaid
sequenceDiagram
    participant User
    participant Discord
    participant bot.ts

    User->>Discord: réagit avec ❌ / ▶️ / 🗑️
    Discord->>bot.ts: messageReactionAdd
    alt message du bot
        bot.ts->>bot.ts: mapper emoji → commande
        alt ❌ → stop
            bot.ts->>bot.ts: resetLLM() + clearCooldown() + setPaused(true)
            bot.ts->>Discord: addReaction("✅")
        else ▶️ → start
            bot.ts->>bot.ts: setPaused(false)
            bot.ts->>Discord: addReaction("✅")
        else 🗑️ → clear
            bot.ts->>bot.ts: resetLLM() + clearCooldown()
            bot.ts->>Discord: addReaction("✅")
        end
    else message d'un autre
        bot.ts-->>bot.ts: ignoré
    end
```
