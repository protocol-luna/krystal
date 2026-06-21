# State Machines & Flowcharts — discord-llm (Project Luna)

This folder contains all architecture diagrams, state machines, flowcharts, and Gantt charts
for the **discord-llm** project — an autonomous Discord bot using a local LLM via llama.cpp.

**Source files:** `.mmd` (Mermaid syntax) — viewable on GitHub or editable in any text editor.  
**Exports:** `.svg` (vector, transparent background, default theme) in [`output/`](output/).

Regenerate all SVGs: `npm run diagrams`

---

## Index

### Architecture & Overview
| # | Source | SVG | Description |
|---|--------|-----|-------------|
| 01 | [`01-architecture-overview.mmd`](01-architecture-overview.mmd) | [`SVG`](output/01-architecture-overview.svg) | Global system architecture: components, dependencies, flows |

### Message Processing
| # | Source | SVG | Description |
|---|--------|-----|-------------|
| 02 | [`02-message-processing.mmd`](02-message-processing.mmd) | [`SVG`](output/02-message-processing.svg) | Complete message processing state machine, from `messageCreate` to response |
| 22 | [`22-complete-lifecycle.mmd`](22-complete-lifecycle.mmd) | [`SVG`](output/22-complete-lifecycle.svg) | Full lifecycle including periodic timers and all paths |
| 21 | [`21-timing-gantt.mmd`](21-timing-gantt.mmd) | [`SVG`](output/21-timing-gantt.svg) | Gantt chart illustrating real wait times |

### Trigger Evaluation
| # | Source | SVG | Description |
|---|--------|-----|-------------|
| 03 | [`03-trigger-evaluation.mmd`](03-trigger-evaluation.mmd) | [`SVG`](output/03-trigger-evaluation.svg) | Trigger evaluation flowchart (mention → dm → name → keyword → random) |

### LLM Core
| # | Source | SVG | Description |
|---|--------|-----|-------------|
| 04 | [`04-llm-core-queue.mmd`](04-llm-core-queue.mmd) | [`SVG`](output/04-llm-core-queue.svg) | LLM queue architecture with 3 backends (cli, server, proxy) and word-by-word emission |
| 05 | [`05-llm-crash-recovery.mmd`](05-llm-crash-recovery.mmd) | [`SVG`](output/05-llm-crash-recovery.svg) | Crash recovery state machine with exponential backoff (1s → 2s → 4s → 8s → 16s) |

### Session & Anti-Spam
| # | Source | SVG | Description |
|---|--------|-----|-------------|
| 06 | [`06-session-limit.mmd`](06-session-limit.mmd) | [`SVG`](output/06-session-limit.svg) | Session limit state machine (30s pause after 8 exchanges) |
| 07 | [`07-anti-spam-queue.mmd`](07-anti-spam-queue.mmd) | [`SVG`](output/07-anti-spam-queue.svg) | Anti-spam queue flowchart (pending queue per channel:user) |

### Human-like Behaviors
| # | Source | SVG | Description |
|---|--------|-----|-------------|
| 08 | [`08-dynamic-status.mmd`](08-dynamic-status.mmd) | [`SVG`](output/08-dynamic-status.svg) | Dynamic Discord status rotation state machine |
| 09 | [`09-spontaneous-message.mmd`](09-spontaneous-message.mmd) | [`SVG`](output/09-spontaneous-message.svg) | Spontaneous message flowchart (every 5min, 12% chance) |
| 10 | [`10-tts-pipeline.mmd`](10-tts-pipeline.mmd) | [`SVG`](output/10-tts-pipeline.svg) | Complete TTS pipeline: sanitize → synthesize → convert → upload to Discord |
| 11 | [`11-typo-correction.mmd`](11-typo-correction.mmd) | [`SVG`](output/11-typo-correction.svg) | Deferred typo correction flowchart (2-4s, edit/message/mixed) |
| 12 | [`12-followup-detection.mmd`](12-followup-detection.mmd) | [`SVG`](output/12-followup-detection.svg) | Follow-up detection state machine (budget of 3/60s) |
| 15 | [`15-delay-computation.mmd`](15-delay-computation.mmd) | [`SVG`](output/15-delay-computation.svg) | Delay computation flowchart with all factors |
| 17 | [`17-hesitation-and-forget.mmd`](17-hesitation-and-forget.mmd) | [`SVG`](output/17-hesitation-and-forget.svg) | Hesitation (15%), forgetfulness (3%), reaction, and ignore flowcharts |
| 18 | [`18-reply-style-selection.mmd`](18-reply-style-selection.mmd) | [`SVG`](output/18-reply-style-selection.svg) | Reply style selection flowchart (quote, ping) |

### Sleep Schedules
| # | Source | SVG | Description |
|---|--------|-----|-------------|
| 16 | [`16-sleep-schedule.mmd`](16-sleep-schedule.mmd) | [`SVG`](output/16-sleep-schedule.svg) | Sleep evaluation flowchart with midnight+ range handling |

### State & Persistence
| # | Source | SVG | Description |
|---|--------|-----|-------------|
| 13 | [`13-state-persistence.mmd`](13-state-persistence.mmd) | [`SVG`](output/13-state-persistence.svg) | Persistence system flowchart with event-bus, debounce, and restore |
| 14 | [`14-event-bus-architecture.mmd`](14-event-bus-architecture.mmd) | [`SVG`](output/14-event-bus-architecture.svg) | Architecture of the two TypedBus (llmBus + stateBus) with emitters and subscribers |

### Configuration
| # | Source | SVG | Description |
|---|--------|-----|-------------|
| 19 | [`19-config-hot-reload.mmd`](19-config-hot-reload.mmd) | [`SVG`](output/19-config-hot-reload.svg) | Hot-reload flowchart for config.yml via fs.watch |

### User Control
| # | Source | SVG | Description |
|---|--------|-----|-------------|
| 20 | [`20-reaction-commands.mmd`](20-reaction-commands.mmd) | [`SVG`](output/20-reaction-commands.svg) | Reaction command state machine (❌ pause / ▶️ resume / 🗑️ reset) |

---

## Color Legend

| Color | Meaning | Diagram types |
|-------|---------|---------------|
| 🟢 Green node | Positive response, action taken | flowchart |
| 🔴 Red node | Blocked, ignored, end of path | flowchart |
| 🔵 Blue node | Entry point or sub-process | flowchart |
| 📝 Note | Implementation details | stateDiagram, flowchart |

---

## Codebase stats
- Total source files: ~30 TypeScript files
- Lines of code: ~3500 LOC
- Tests: ~71 test files (Bun)
- LLM backends: 3 (cli, server, proxy)
- Event bus types: 7 (llmBus) + 1 (stateBus)
- Simulated human behaviors: 8 (delay, ignore, forget, hesitation, typo, reaction, voice, follow-up)
