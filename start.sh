#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Configuration
: "${LLM_CPU_AFFINITY:=0,1}"
: "${LLM_N_THREADS:=auto}"
: "${LLM_N_CTX:=8192}"
: "${LLM_N_SLOTS:=1}"

# Auto-detect thread count from CPU affinity
if [ "$LLM_N_THREADS" = "auto" ] || [ "$LLM_N_THREADS" = "0" ]; then
	count=0
	for part in $(echo "$LLM_CPU_AFFINITY" | tr ',' ' '); do
		if echo "$part" | grep -q '-'; then
			start=$(echo "$part" | cut -d- -f1)
			end=$(echo "$part" | cut -d- -f2)
			count=$(( count + end - start + 1 ))
		else
			count=$(( count + 1 ))
		fi
	done
	LLM_N_THREADS=$count
fi
: "${LLM_N_CTX:=8192}"
: "${LLM_N_SLOTS:=1}"

npx pm2 delete llm-server llm-client 2>/dev/null || true

npx pm2 start taskset \
  --interpreter none \
  --name llm-server \
  -- \
  -c "$LLM_CPU_AFFINITY" \
  ./bin/llama/llama-server \
  -m ./models/Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf \
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
