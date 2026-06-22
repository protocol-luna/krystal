#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

npx pm2 delete llm-server llm-client 2>/dev/null || true

npx pm2 start ./bin/llama/llama-server \
  --interpreter none \
  --name llm-server \
  -- \
  -m ./models/Discord-Micae-Hermes-3-3B.Q8_0.gguf \
  -t 4 \
  -c 4096 \
  -np 4 \
  --slot-prompt-similarity 0 \
  --cache-reuse 256 \
  --host 127.0.0.1 \
  --port 3125 \
  --no-slots

npx pm2 start self-cli.cjs --interpreter node --name llm-client

npx pm2 save
npx pm2 status
