#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

MODE="${1:-}"
if [ -z "$MODE" ]; then
  echo "Usage: $0 <mode>"
  echo ""
  echo "Modes:"
  echo "  small   Luna-Protocol-1.5B  on port 3124  (GENERIC — fast)"
  echo "  large   Discord-Hermes-8B    on port 3125  (SEMANTIC — deep)"
  echo ""
  echo "Examples:"
  echo "  $0 small"
  echo "  $0 large"
  exit 1
fi

# Backward compat: KRYSTAL_* overrides LLM_*
: "${KRYSTAL_MODEL_PATH:=${LLM_MODEL_PATH:-}}"
: "${KRYSTAL_PORT:=${LLM_PORT:-}}"
: "${KRYSTAL_CPU_AFFINITY:=${LLM_CPU_AFFINITY:-}}"
: "${KRYSTAL_N_THREADS:=${LLM_N_THREADS:-auto}}"
: "${KRYSTAL_N_CTX:=${LLM_N_CTX:-8192}}"
: "${KRYSTAL_N_SLOTS:=${LLM_N_SLOTS:-1}}"

case "$MODE" in
  small)
    : "${KRYSTAL_MODEL_PATH:=./models/Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf}"
    : "${KRYSTAL_PORT:=3124}"
    : "${KRYSTAL_CPU_AFFINITY:=0}"
    ;;
  large)
    : "${KRYSTAL_MODEL_PATH:=./models/Discord-Hermes-3-3B.Q8_0.gguf}"
    : "${KRYSTAL_PORT:=3125}"
    : "${KRYSTAL_CPU_AFFINITY:=0,1}"
    ;;
  *)
    echo "Unknown mode: $MODE"
    echo "Valid modes: small, large"
    exit 1
    ;;
esac

# Auto-detect thread count from CPU affinity
if [ "${KRYSTAL_N_THREADS}" = "auto" ]; then
  count=0
  for part in $(echo "$KRYSTAL_CPU_AFFINITY" | tr ',' ' '); do
    if echo "$part" | grep -q '-'; then
      start=$(echo "$part" | cut -d- -f1)
      end=$(echo "$part" | cut -d- -f2)
      count=$(( count + end - start + 1 ))
    else
      count=$(( count + 1 ))
    fi
  done
  KRYSTAL_N_THREADS=$count
fi

: "${KRYSTAL_N_CTX:=8192}"
: "${KRYSTAL_N_SLOTS:=1}"

name="krystal-${MODE}"

echo "[krystal] mode=$MODE port=$KRYSTAL_PORT threads=$KRYSTAL_N_THREADS cpu=$KRYSTAL_CPU_AFFINITY"
echo "[krystal] model=$KRYSTAL_MODEL_PATH"

npx pm2 delete "$name" 2>/dev/null || true

npx pm2 start taskset \
  --interpreter none \
  --name "$name" \
  -- \
  -c "$KRYSTAL_CPU_AFFINITY" \
  ./bin/llama/llama-server \
  -m "$KRYSTAL_MODEL_PATH" \
  -t "$KRYSTAL_N_THREADS" \
  -c "$KRYSTAL_N_CTX" \
  -np "$KRYSTAL_N_SLOTS" \
  --slot-prompt-similarity 0 \
  --cache-reuse 256 \
  --host 127.0.0.1 \
  --port "$KRYSTAL_PORT" \
  --no-slots

npx pm2 save
npx pm2 status
