# Krystal

Krystal is the LLM inference server for the Luna Protocol ecosystem. It runs llama.cpp server to serve GGUF models.

> **Architecture**: `Sapphire → Krystal (llama.cpp)`

## Setup

Single-backend mode — both routes serve the same model on port 3124.

```bash
# Start the server
./start.sh
```

Runs via PM2 with the Luna Protocol 1.5B model:

```
Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5-200k-instruct.Q4_K_M.gguf
```

## Configuration

Key parameters in `start.sh`:

| Parameter | Value |
|-----------|-------|
| Port | 3124 |
| Model | Luna 1.5B Q4_K_M (941 MB) |
| Context | 4096 tokens |
| GPU layers | 0 (CPU only) |
| Threads | 6 |

## Requirements

- llama.cpp compiled server
- GGUF model in `models/`
- ~1 GB disk per model
- ~3 GB RAM for 1.5B Q4_K_M

## Running

```bash
# Start
pm2 start start.sh --interpreter bash --name krystal-small

# View logs
pm2 logs krystal-small

# Stop
pm2 stop krystal-small

# Restart
pm2 restart krystal-small
```
