# Coverage plan

## Priorité

| Priorité | Module | Catégorie | Tests | Effort |
|---|---|---|---|---|
| P0 | `behavior/typo.ts` | Pure | applyTypo (AZERTY + QWERTY, edge cases) | ~15min |
| P0 | `core/bus.ts` | Pure | TypedBus (on/off/once/emit/removeAll, multi-listeners) | ~15min |
| P0 | `behavior/mannerisms.ts` | Simple | computeDelay, shouldIgnore, shouldReact, pickReaction (mock config) | ~20min |
| P0 | `behavior/sleep.ts` | Simple | getSleepBehavior (mock config + Date) | ~15min |
| P0 | `state/state.ts` | Simple | isPaused, setPaused, cooldowns, markReplied, botActivity, follow-up, dumpState/restoreState, globalInactivity | ~30min |
| P0 | `state/trigger.ts` | Simple | evaluateMessage (tous les triggers : mention, dm, name, keyword, follow-up, random, paused, cooldown, names word boundary) | ~30min |
| P0 | `state/state-bus.ts` | Simple | stateBus singleton émet state:changed | ~5min |
| P0 | `core/llm-bus.ts` | Simple | llmBus singleton, events tokens/done/error | ~5min |
| P0 | `guild.ts` | Simple | isTextChannel, findMostActiveChannel | ~10min |
| P1 | `config.ts` | Complex | Parsing YAML, hot-reload, getters live, fallbacks, static exports (token, paths) via mock fs | ~30min |
| P1 | `bot/pending.ts` | Simple | processing, pendingMessages, queue/drain, restorePending (mock persistence + state) | ~20min |
| P1 | `tts/audio.ts` | Complex (partially pure) | sanitizeForTTS, buildWaveformBase64, hasUnsafeTTSText (pure) ; wavToOgg, getAudioDuration (mock child_process) | ~25min |
| P1 | `tts/voice-message.ts` | Simple | shouldSendVoice (mock config) | ~5min |
| P2 | `core/llm-core.ts` | Complex | askLLM, resetLLM, isLLMBusy, shutdown (mock spawn + fetch) | ~45min |
| P2 | `core/llm-client.ts` | Complex | askLLM, resetLLM, isLLMBusy (mock fetch, NDJSON streaming) | ~20min |
| P2 | `bot.ts` | Complex | startBot, logAndReact, triggerLunaReply, handleSleep, startDynamicStatus (mock Eris.Client, events) | ~1h |
| P2 | `spontaneous.ts` | Complex | trySpawn (mock Eris.Client, guilds iteration) | ~20min |
| P2 | `bot/reactions.ts` | Complex | handleReactionCommand (mock Eris, llm-core, state) | ~15min |
| P2 | `bot/typo-correction.ts` | Simple | applyTypoCorrection (mock Eris.Client.editMessage/createMessage) | ~15min |
| P2 | `tts/piper.ts` | Complex | initTTS, isTTSReady, synthesize (mock pipertts) | ~15min |
| P2 | `tts/upload.ts` | Complex | requestUploadUrl, putFileToUploadUrl, postVoiceMessage (mock fetch Discord API) | ~20min |
| P2 | `state/persistence.ts` | Complex | loadState, persistState, buildPending, scheduleSave (mock fs/promises, fake timers) | ~25min |
| P2 | `core/llm-server.ts` | Complex | serveur HTTP NDJSON (mock http) | ~20min |

## Setup

```bash
npm i -D vitest
```

```json
// package.json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

## Conventions

- 1 fichier = 1 suite `describe` du même nom que le module
- `vi.mock()` pour les imports externes (config, state, eris, fs, child_process, fetch)
- `beforeEach` reset pour les états partagés (Maps module-level, rawCfg, timers)
- Config mockée via mutation directe de `rawCfg` (après import de config.ts)
- `Date.now()` contrôlé via `vi.setSystemTime()`
- `Math.random()` contrôlé via `vi.spyOn(Math, 'random').mockReturnValue()`

## Cibles

| Métrique | Cible |
|---|---|
| Modules P0 | 100% (8 modules) |
| Modules P1 | 80%+ (4 modules) |
| Modules P2 | 60%+ (11 modules) |
| Total lines | 70%+ |
| Branches | 60%+ |
