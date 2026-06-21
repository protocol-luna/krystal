# State Machines & Flowcharts — discord-llm (Project Luna)

This folder contains all architecture diagrams, state machines, flowcharts, and Gantt charts
for the **discord-llm** project — an autonomous Discord bot using a local LLM via llama.cpp.

Format: [Mermaid](https://mermaid.js.org/) — viewable on GitHub, or via `npx @mermaid-js/mermaid-cli`.

Diagrams use the dark theme (`%%{init: {"theme":"dark"}}%%`) and are exported as high-resolution PNGs (3x scale, 4096px wide) to `state-machines/output/`.

---

## Index

### Architecture & Overview
| # | File | Description |
|---|------|-------------|
| 01 | `01-architecture-overview.mmd` | Global system architecture: components, dependencies, flows |

### Message Processing
| # | File | Description |
|---|------|-------------|
| 02 | `02-message-processing.mmd` | Complete message processing state machine, from `messageCreate` to response |
| 22 | `22-complete-lifecycle.mmd` | Full lifecycle including periodic timers and all paths |
| 21 | `21-timing-gantt.mmd` | Gantt chart illustrating real wait times |

### Trigger Evaluation
| # | File | Description |
|---|------|-------------|
| 03 | `03-trigger-evaluation.mmd` | Trigger evaluation flowchart (mention → dm → name → keyword → random) |

### LLM Core
| # | File | Description |
|---|------|-------------|
| 04 | `04-llm-core-queue.mmd` | LLM queue architecture with 3 backends (cli, server, proxy) and word-by-word emission |
| 05 | `05-llm-crash-recovery.mmd` | Crash recovery state machine with exponential backoff (1s → 2s → 4s → 8s → 16s) |

### Session & Anti-Spam
| # | File | Description |
|---|------|-------------|
| 06 | `06-session-limit.mmd` | Session limit state machine (30s pause after 8 exchanges) |
| 07 | `07-anti-spam-queue.mmd` | Anti-spam queue flowchart (pending queue per channel:user) |

### Human-like Behaviors
| # | File | Description |
|---|------|-------------|
| 08 | `08-dynamic-status.mmd` | Dynamic Discord status rotation state machine |
| 09 | `09-spontaneous-message.mmd` | Spontaneous message flowchart (every 5min, 12% chance) |
| 10 | `10-tts-pipeline.mmd` | Complete TTS pipeline: sanitize → synthesize → convert → upload to Discord |
| 11 | `11-typo-correction.mmd` | Deferred typo correction flowchart (2-4s, edit/message/mixed) |
| 12 | `12-followup-detection.mmd` | Follow-up detection state machine (budget of 3/60s) |
| 15 | `15-delay-computation.mmd` | Delay computation flowchart with all factors |
| 17 | `17-hesitation-and-forget.mmd` | Hesitation (15%), forgetfulness (3%), reaction, and ignore flowcharts |
| 18 | `18-reply-style-selection.mmd` | Reply style selection flowchart (quote, ping) |

### Sleep Schedules
| # | File | Description |
|---|------|-------------|
| 16 | `16-sleep-schedule.mmd` | Sleep evaluation flowchart with midnight+ range handling |

### State & Persistence
| # | File | Description |
|---|------|-------------|
| 13 | `13-state-persistence.mmd` | Persistence system flowchart with event-bus, debounce, and restore |
| 14 | `14-event-bus-architecture.mmd` | Architecture of the two TypedBus (llmBus + stateBus) with emitters and subscribers |

### Configuration
| # | File | Description |
|---|------|-------------|
| 19 | `19-config-hot-reload.mmd` | Hot-reload flowchart for config.yml via fs.watch |

### User Control
| # | File | Description |
|---|------|-------------|
| 20 | `20-reaction-commands.mmd` | Reaction command state machine (❌ pause / ▶️ resume / 🗑️ reset) |

---

## Legend (flowcharts)
- **🟢 Green** → Positive response, action taken
- **🔴 Red** → Blocked, ignored, end of path
- **🔵 Blue** → Entry point or sub-process
- **📝 Note** → Implementation details

---

## Codebase stats
- Total source files: ~30 TypeScript files
- Lines of code: ~3500 LOC
- Tests: ~71 test files (Bun)
- LLM backends: 3 (cli, server, proxy)
- Event bus types: 7 (llmBus) + 1 (stateBus)
- Simulated human behaviors: 8 (delay, ignore, forget, hesitation, typo, reaction, voice, follow-up)
