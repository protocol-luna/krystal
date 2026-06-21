# State Machines & Flowcharts — discord-llm (Protocole Luna)

Ce dossier contient tous les diagrammes d'architecture, state machines, flowcharts et Gantt
du projet **discord-llm**, un bot Discord autonome utilisant un LLM local via llama.cpp.

Format: [Mermaid](https://mermaid.js.org/) — visualisable sur GitHub, ou via `npx @mermaid-js/mermaid-cli`.

---

## Index des diagrammes

### Architecture & Vue d'ensemble
| # | Fichier | Description |
|---|---------|-------------|
| 01 | `01-architecture-overview.mmd` | Architecture globale du système : composants, dépendances, flux |

### Message Processing
| # | Fichier | Description |
|---|---------|-------------|
| 02 | `02-message-processing.mmd` | State machine complète du traitement d'un message, de `messageCreate` à la réponse |
| 22 | `22-complete-lifecycle.mmd` | Cycle de vie complet incluant les timers périodiques et tous les chemins |
| 21 | `21-timing-gantt.mmd` | Diagramme de Gantt illustrant les temps d'attente réels |

### Trigger Evaluation
| # | Fichier | Description |
|---|---------|-------------|
| 03 | `03-trigger-evaluation.mmd` | Flowchart de l'évaluation des triggers (mention → dm → name → keyword → random) |

### LLM Core
| # | Fichier | Description |
|---|---------|-------------|
| 04 | `04-llm-core-queue.mmd` | Architecture de la file d'attente LLM avec les 3 backends (cli, server, proxy) et l'émission mot-par-mot |
| 05 | `05-llm-crash-recovery.mmd` | Machine d'état du crash recovery avec backoff exponentiel (1s → 2s → 4s → 8s → 16s) |

### Session & Anti-Spam
| # | Fichier | Description |
|---|---------|-------------|
| 06 | `06-session-limit.mmd` | State machine des limites de session (pause de 30s après 8 échanges) |
| 07 | `07-anti-spam-queue.mmd` | Flowchart de la file anti-spam (pending queue par channel:user) |

### Comportements Humains
| # | Fichier | Description |
|---|---------|-------------|
| 08 | `08-dynamic-status.mmd` | State machine de la rotation dynamique du status Discord |
| 09 | `09-spontaneous-message.mmd` | Flowchart des messages spontanés (toutes les 5min, 12% de chance) |
| 10 | `10-tts-pipeline.mmd` | Pipeline TTS complet : sanitize → synthèse → conversion → upload Discord |
| 11 | `11-typo-correction.mmd` | Flowchart de la correction de typo différée (2-4s, edit/message/mixed) |
| 12 | `12-followup-detection.mmd` | State machine de la détection de follow-up (budget de 3/60s) |
| 15 | `15-delay-computation.mmd` | Flowchart du calcul de délai avec tous les facteurs |
| 17 | `17-hesitation-and-forget.mmd` | Flowcharts de l'hésitation (15%), l'oubli (3%), la réaction et l'ignore |
| 18 | `18-reply-style-selection.mmd` | Flowchart de la sélection du style de réponse (quote, ping) |

### Sleep Schedules
| # | Fichier | Description |
|---|---------|-------------|
| 16 | `16-sleep-schedule.mmd` | Flowchart de l'évaluation du sommeil avec gestion des plages minuit+ |

### State & Persistence
| # | Fichier | Description |
|---|---------|-------------|
| 13 | `13-state-persistence.mmd` | Flowchart du système de persistance avec event-bus, debounce et restauration |
| 14 | `14-event-bus-architecture.mmd` | Architecture des deux TypedBus (llmBus + stateBus) avec émetteurs et souscripteurs |

### Configuration
| # | Fichier | Description |
|---|---------|-------------|
| 19 | `19-config-hot-reload.mmd` | Flowchart du hot-reload de config.yml via fs.watch |

### Contrôle Utilisateur
| # | Fichier | Description |
|---|---------|-------------|
| 20 | `20-reaction-commands.mmd` | State machine des commandes par réaction (❌ pause / ▶️ reprise / 🗑️ reset) |

---

## Légende des couleurs (flowcharts)
- **🟢 Vert** → Réponse positive, action effectuée
- **🔴 Rouge** → Blocage, ignore, fin de chemin
- **🔵 Bleu** → Point d'entrée ou sous-processus
- **📝 Note** → Détails d'implémentation

---

## Statistiques du codebase
- Total fichiers source: ~30 fichiers TypeScript
- Lignes de code: ~3500 LOC
- Tests: ~71 fichiers de test (Bun)
- Backends LLM: 3 (cli, server, proxy)
- Événements bus: 7 (llmBus) + 1 (stateBus)
- Comportements humains simulés: 8 (délai, ignore, oubli, hésitation, typo, réaction, voix, follow-up)
