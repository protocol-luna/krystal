# krystal

LLM inference server for the Luna Protocol ecosystem.

Wraps [llama.cpp](https://github.com/ggerganov/llama.cpp) (`llama-server`) to serve GGUF models via an OpenAI-compatible HTTP API.

## Stack

- **llama-server** (C++) -- model inference engine
- **PM2** -- process management & auto-restart

## Usage

Start a **small** (fast) or **large** (deep) instance:

```bash
npm install
./start.sh small     # Luna 1.5B  on :3124 (GENERIC)
./start.sh large     # Hermes-8B  on :3125 (SEMANTIC)
```

Both can run simultaneously.

## Configuration

Environment variables (prefixed `KRYSTAL_*` or legacy `LLM_*`):

| Variable | Small default | Large default | Description |
|---|---|---|---|
| `KRYSTAL_MODEL_PATH` | Luna-Protocol-1.5B...gguf | Discord-Hermes-3-3B.Q8_0.gguf | Path to GGUF model |
| `KRYSTAL_PORT` | `3124` | `3125` | Server port |
| `KRYSTAL_CPU_AFFINITY` | `0` | `0,1` | CPU core affinity |
| `KRYSTAL_N_THREADS` | `auto` | `auto` | Thread count |
| `KRYSTAL_N_CTX` | `8192` | `8192` | Context size |
| `KRYSTAL_N_SLOTS` | `1` | `1` | Slot count |

## Model

Download a GGUF model:

```bash
npm run download-model
```

## Related

- [sapphire](https://github.com/protocol-luna/sapphire) -- LLM gateway (classification + routing)
- [pixieglow](https://github.com/protocol-luna/pixieglow) -- Matrix bot
- [jade](https://github.com/protocol-luna/jade) -- Discord bot
- [protocol-luna](https://github.com/protocol-luna/.github) -- Documentation & state-machine diagrams
