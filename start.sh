#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

npx pm2 delete llm-server llm-client 2>/dev/null || true

npx pm2 start self-cli.cjs --interpreter node --name llm-server -- server
npx pm2 start self-cli.cjs --interpreter node --name llm-client

npx pm2 save
npx pm2 status
