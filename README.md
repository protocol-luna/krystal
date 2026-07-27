<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/logo.png">
    <img src="images/logo.png" alt="Krystal" width="200" style="border-radius: 20px;">
  </picture>
  <h1 align="center">Krystal</h1>
  <p align="center">LLM inference server for the Luna Protocol ecosystem</p>
  <p align="center">
    <a href="https://github.com/protocol-luna/krystal/blob/main/LICENSE">
      <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License">
    </a>
    <a href="https://llama.cpp/">
      <img src="https://img.shields.io/badge/backend-llama.cpp-FF6F00?style=flat-square" alt="llama.cpp">
    </a>
    <a href="https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues-200k-instruct">
      <img src="https://img.shields.io/badge/model-Luna%201.5B%20Q4_K_M-FFD21E?style=flat-square" alt="Model">
    </a>
    <a href="https://github.com/protocol-luna">
      <img src="https://img.shields.io/badge/part%20of-Luna%20Protocol-9370DB?style=flat-square" alt="Luna Protocol">
    </a>
  </p>
</p>

Krystal runs **llama.cpp `llama-server`** to serve GGUF models via an OpenAI-compatible HTTP API. It is the inference backend for the Luna Protocol ecosystem — called by Sapphire (the LLM gateway).

```mermaid
graph LR
    Sapphire["Sapphire<br/>LLM Gateway"] -- "HTTP :3124" --> Krystal["Krystal<br/><strong>llama.cpp</strong>"]
```

## Technical Overview

Krystal is not a code project in the traditional sense — it's an **orchestration layer** for llama.cpp. The entire "codebase" is a shell script (`start.sh`) that launches `llama-server` with specific model and hardware parameters. The `bin/` directory contains a pre-compiled llama.cpp build (version 9682).

### Architecture

```
Sapphire (Python/FastAPI)
  |
  |-- HTTP POST /v1/chat/completions
  |   { messages, id_slot, cache_prompt, max_tokens,
  |     temperature, repeat_penalty, mirostat, ... }
  |
  v
Krystal (llama-server)
  |
  |-- GGUF model loaded in memory
  |-- KV cache with 256-token reuse
  |-- OpenAI-compatible HTTP API on :3124 / :3125
  |
  v
LLM Inference (CPU only)
```

### Dual-Mode Setup

`start.sh` supports two modes, selected by argument:

| Mode | Argument | Model | Port | CPU Pinning | Role |
|------|----------|-------|------|-------------|------|
| Small | `small` | Luna 1.5B Q4_K_M (941 MB) | 3124 | Core 0 | Fast, generic |
| Large | `large` | Discord-Hermes-8B Q2_K | 3125 | Cores 0,1 | Deep, semantic |

The Luna 1.5B model is available at `fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues-200k-instruct` on HuggingFace.

### llama-server Launch Parameters

```bash
taskset -c "$CPU_AFFINITY" ./bin/llama/llama-server \
  -m "$MODEL_PATH"           # GGUF model file
  -t "$THREADS"              # CPU threads (auto-detected from affinity)
  -c 8192                    # Context window: 8192 tokens
  -np 1                      # Physical batch slots: 1
  --slot-prompt-similarity 0 # Disable prompt similarity slot reuse
  --cache-reuse 256          # Reuse KV cache for up to 256 tokens
  --host 127.0.0.1           # Localhost only
  --port "$PORT"             # 3124 (small) or 3125 (large)
  --no-slots                 # Each request gets its own context
```

Key details:
- **`taskset`** pins the server to specific CPU cores for performance isolation
- **Context window:** 8192 tokens (not 4096 as in original README)
- **KV cache reuse:** saves recomputation for overlapping prompt prefixes
- **CPU-only inference:** no GPU offloading configured
- **OpenAI-compatible API:** uses `/v1/chat/completions` endpoint with standard request/response format

### Environment Variables

Backward-compatible with two namespaces (`KRYSTAL_*` takes precedence over `LLM_*`):

| Variable | Default | Description |
|----------|---------|-------------|
| `KRYSTAL_MODEL_PATH` | `./models/...` | Path to GGUF model |
| `KRYSTAL_PORT` | 3124 / 3125 | HTTP port |
| `KRYSTAL_CPU_AFFINITY` | `0` / `0,1` | CPU cores to pin |
| `KRYSTAL_N_THREADS` | `auto` | Thread count (auto-detects from affinity) |
| `KRYSTAL_N_CTX` | 8192 | Context window tokens |
| `KRYSTAL_N_SLOTS` | 1 | Inference slots |

### Pre-compiled llama.cpp (`bin/`)

Contains **62 files** from llama.cpp build 9682 (MIT License):

**Key binaries:**
- `llama-server` — HTTP inference server (used by Krystal)
- `llama-cli` — Interactive CLI for testing
- `llama-bench` / `llama-batched-bench` — Benchmarking tools
- `llama-quantize` — GGUF quantizer
- `llama-tokenize` — Tokenizer utility
- `llama-perplexity` — Perplexity evaluation

**CPU-optimized shared libraries:**
`libggml-cpu-*.so` variants for: `alderlake`, `cannonlake`, `cascadelake`, `cooperlake`, `haswell`, `icelake`, `ivybridge`, `piledriver`, `sandybridge`, `sapphirerapids`, `skylakex`, `sse42`, `x64`, `zen4`

## Architecture Context

Krystal is one of six services in the Luna Protocol:

```
Discord → Jade → Emerald → Sapphire → Krystal (llama.cpp)
Matrix → Pixieglow → Emerald → Sapphire → Krystal (llama.cpp)
                          ↘ Ruby (Markov chain)
```

Sapphire classifies each message as **FUTILE** (casual) or **INTERESSANT** (substantive). FUTILE messages route to the "small" backend (port 3124, faster), while INTERESSANT messages route to the "large" backend (port 3125, deeper). Both can point to the same Krystal instance for single-backend setups.

## Requirements

- llama.cpp compiled server (included in `bin/`)
- GGUF model in `models/` (download via `npm run download-model`)
- ~1 GB disk per model
- ~3 GB RAM for 1.5B Q4_K_M
- CPU with sufficient cores (pinning recommended)

## Setup

```bash
# Start the server
./start.sh small    # or: ./start.sh large

# With PM2
pm2 start start.sh --interpreter bash --name krystal-small -- small
```

## Download Models

```bash
# Luna 1.5B (Q4_K_M, ~941 MB)
npm run download-model:small

# Discord-Hermes-8B (Q2_K, ~3.3 GB)
npm run download-model:large
```

## Running

```bash
# Start
pm2 start start.sh --interpreter bash --name krystal-small -- small

# View logs
pm2 logs krystal-small

# Stop
pm2 stop krystal-small

# Restart
pm2 restart krystal-small

# Cleanup all Krystal processes
./cleanup.sh
```
