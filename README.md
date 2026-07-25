# krystal

LLM inference server for the [jade](https://github.com/protocol-luna/jade) Discord bot.

Wraps [llama.cpp](https://github.com/ggerganov/llama.cpp) (`llama-server`) to serve GGUF models via an OpenAI-compatible HTTP API.

## Stack

- **llama-server** (C++) — model inference engine
- **PM2** — process management & auto-restart

## Usage

```bash
npm install
cp config.example.yml config.yml
# edit config.yml with your model path
./start.sh
```

The server listens on `http://127.0.0.1:3125` by default.

## Configuration

See `config.example.yml` for all options. Environment variables override YAML keys:

- `LLM_CPU_AFFINITY` — CPU core affinity (default: `0,1`)
- `LLM_N_THREADS` — thread count (default: auto-detect from affinity)
- `LLM_N_CTX` — context size (default: `8192`)
- `LLM_N_SLOTS` — slot count (default: `1`)

## Model

Download a GGUF model:

```bash
npm run download-model
```

## Related

- [jade](https://github.com/protocol-luna/jade) — Discord bot client
