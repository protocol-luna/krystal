# discord-llm-bot

Bot Discord minimal qui parle a une API compatible OpenAI (llama.cpp `server` ou autre) en local.

## Setup

```bash
npm install
cp .env.example .env
# édite .env : DISCORD_TOKEN, LLAMA_API_URL si besoin
# édite prompt.txt : ton system prompt
npm start
```

Le system prompt est lu depuis `prompt.txt` à chaque démarrage du bot (pas de hot-reload, redémarre le process après modif).

## Lancer llama.cpp en local (compatible OpenAI)

```bash
./server -m ton-modele.gguf --port 8080 --parallel 4
# expose /v1/chat/completions par défaut
```

`--parallel N` doit matcher `LLAMA_PARALLEL_SLOTS` dans `.env` (défaut 4). Chaque salon Discord est assigné à un slot fixe (`id_slot`), donc le cache KV reste chaud entre les messages d'un même salon -- comme avec `llama-cli` en mode interactif, mais sur HTTP. Si tu as plus de salons actifs en même temps que de slots, les plus anciens se font voler leur slot et perdent leur cache (re-traitement complet au prochain message).

Le bot fetch directement sur `http://localhost:8080/v1/chat/completions` (modifiable via `LLAMA_API_URL` dans `.env`). Comme llama.cpp et OpenAI partagent le même format de payload (`messages`, `model`, `max_tokens`, `temperature`), tu peux switcher vers l'API OpenAI réelle juste en changeant `LLAMA_API_URL` et en ajoutant un header Authorization si besoin (les champs `id_slot`/`cache_prompt` seront alors simplement ignorés par l'API OpenAI).

## Usage Discord

- Mentionne le bot dans un salon: `@bot ta question`
- Ou envoie-lui un DM directement
- Historique de conversation gardé en RAM par salon (10 derniers messages)

## Notes

- Active "Message Content Intent" dans le portail développeur Discord (onglet Bot)
- Invite le bot avec scope `bot` + permission `Send Messages` + `Read Message History`
