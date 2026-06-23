#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Configuration
: "${LLM_CPU_AFFINITY:=0,1}"
: "${LLM_N_THREADS:=2}"
: "${LLM_N_CTX:=8192}"
: "${LLM_N_SLOTS:=1}"

npx pm2 delete llm-server llm-client 2>/dev/null || true

npx pm2 start taskset \
  --interpreter none \
  --name llm-server \
  -- \
  -c "$LLM_CPU_AFFINITY" \
  ./bin/llama/llama-server \
  -m ./models/Discord-Micae-Hermes-3-3B.Q8_0.gguf \
  -t "$LLM_N_THREADS" \
  -c "$LLM_N_CTX" \
  -np "$LLM_N_SLOTS" \
  --slot-prompt-similarity 0 \
  --cache-reuse 256 \
  --host 127.0.0.1 \
  --port 3125 \
  --no-slots

npx pm2 start self-cli.cjs --interpreter node --name llm-client

npx pm2 save
npx pm2 status
