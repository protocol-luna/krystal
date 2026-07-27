#!/usr/bin/env bash
set -euo pipefail

echo "[krystal] stopping all PM2 processes matching 'krystal-*' or 'llm-*'..."

npx pm2 delete krystal-small 2>/dev/null || true
npx pm2 delete krystal-large 2>/dev/null || true

# legacy names from old start.sh
npx pm2 delete llm-server 2>/dev/null || true
npx pm2 delete llm-client 2>/dev/null || true

npx pm2 save 2>/dev/null || true

echo "[krystal] all stopped"
npx pm2 status 2>/dev/null || echo "[krystal] (pm2 not found -- nothing was running)"