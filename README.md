# pixieglow — Discord LLM Bot

Bot Discord autonome qui fait tourner un LLM local (llama.cpp) et converse de façon naturelle dans les salons et DMs.

## Architecture

Deux processus séparés :

- **llm-server** (`src/llm-server.ts`) — spawn `llama-cli`, queue les requêtes, stream NDJSON sur `:3124`
- **bot client** (`src/bot.ts`) — connexion Discord via Eris, décisions de trigger, streaming vers le serveur LLM

Séparés pour permettre le hot-reload du bot sans recharger le modèle.

## Setup

```bash
npm install
cp .env.example .env
# édite .env : DISCORD_TOKEN
# crée prompt.txt : le system prompt
```

### `.env`

| Variable | Défaut | Description |
|---|---|---|
| `DISCORD_TOKEN` | — | Token du bot Discord |
| `LLAMA_CLI_PATH` | `../llama-b9682/llama-cli` | Chemin vers `llama-cli` |
| `LLAMA_MODEL_PATH` | `./models/*.gguf` | Chemin du modèle GGUF |
| `PORT` | `3124` | Port du serveur LLM |

### `prompt.txt`

Lu au démarrage dans `./prompt.txt`. Exemple :

```
Your name is pixieglow. You are a 21-year-old girl studying art.
Talk naturally and never prefix your replies with your name.
```

## Lancer

```bash
# Dev — hot-reload LLM + bot + bundler watch
npm run dev

# Production
npm run build
npm start
```

## Déclencheurs

Par ordre de priorité :

| Raison | Conditions |
|---|---|
| `mention` | Le bot est `@mentionné` — bypass pause, bypass ignore |
| `dm` | Message privé |
| `name` | Le message contient "Luna", "Pixie" ou le pseudo Discord |
| `keyword` | Le message contient un mot-clé : `hello`, `hi`, `hey`, `yo`, `ai`, `bot`, etc. |
| `follow-up` | Le bot est le dernier interlocuteur + activité récente (< 15s) — répond à tout |
| `random` | 1.5% de chance sur chaque message ignoré |

Les mots-clés et noms sont matchés en mot entier (`\b`), pas en substring.

## Comportement

- **Délai variable** 800–4000ms avant chaque réponse (simule la réflexion)
- **Ignore chance** 8% pour les triggers normaux, 0% pour les mentions/DMs
- **Réactions** 6% de chance, 30% d'utiliser un émoji personnalisé du serveur
- **Typing indicator** seulement quand le LLM commence à générer
- **Spontané** 12% toutes les 5min : le bot poste un message dans le salon le plus actif
- **Réponse multi-chunk** les `\n` dans le stream génèrent des messages séparés
- **Stop** `-stop` met en pause, `-start` réactive, `-clear` reset le contexte

## Commandes

| Commande | Effet |
|---|---|
| `-stop` | Pause tous les déclencheurs, reset le contexte LLM |
| `-start` | Réactive le bot |
| `-clear` | Reset l'historique de conversation du canal |

## Structure

```
src/
├── index.ts          # Point d'entrée
├── bot.ts            # Client Discord, message handler, réponse
├── config.ts         # Configuration (env, triggers, paramètres LLM)
├── trigger.ts        # Décisions de déclenchement
├── mannerisms.ts     # Délai, ignore, réactions
├── spontaneous.ts    # Messages spontanés périodiques
├── guild.ts          # Utilitaire salon le plus actif
├── llm-server.ts     # Serveur HTTP NDJSON + process llama-cli
├── llm-client.ts     # Client HTTP vers le serveur LLM
└── llm.ts            # Ancien module monolithique (archivé)
```

## Portail Développeur Discord

- Active **Message Content Intent** (onglet Bot)
- Invite avec scope `bot` + permissions `Send Messages`, `Read Message History`
