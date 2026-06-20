# Plan — Typed Event Bus Architecture

## Objectif

Remplacer les callbacks manuels et les appels `saveAllState()` explicites par un bus d'événements typé, découpé en deux bus spécialisés.

## Principe

```
llm-core.ts → émet sur llmBus (token, done, error, crash, ready, reset)
            → bot.ts écoute

state.ts    → émet sur stateBus (changed)
            → persistence.ts écoute (plus de saveAllState() manuel)
```

## 1. `core/bus.ts` — Bus générique typé

```typescript
type EventMap = Record<string, unknown[]>;

export class TypedBus<Events extends EventMap> {
  private listeners = new Map<keyof Events, Set<(...args: unknown[]) => void>>();

  on<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener as (...args: unknown[]) => void);
  }

  off<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): void {
    this.listeners.get(event)?.delete(listener as (...args: unknown[]) => void);
  }

  once<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): void {
    const wrapper = (...args: unknown[]) => {
      this.off(event, wrapper as (...args: unknown[]) => void);
      (listener as (...args: unknown[]) => void)(...args);
    };
    this.on(event, wrapper as (...args: Events[K]) => void);
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    this.listeners.get(event)?.forEach((fn) => fn(...args));
  }

  removeAll(): void {
    this.listeners.clear();
  }
}
```

## 2. `core/llm-bus.ts` — Événements LLM

```typescript
export type LLMEvents = {
  token: [chunk: string];
  done: [fullText: string];
  error: [err: Error];
  crash: [code: number | null];
  ready: [];
  reset: [];
};

export const llmBus = new TypedBus<LLMEvents>();
```

### Changements dans `llm-core.ts`

**Avant :** `askLLM()` prend des callbacks, la queue stocke `{ callbacks, resolve, reject }`.

**Après :** `askLLM()` ne prend plus de callbacks. Les événements sont émis sur `llmBus`.

- `currentOnChunk(chunk)` → `llmBus.emit("token", chunk)`
- `currentOnDone(text)` → `llmBus.emit("done", text)`
- Erreur spawn/crash → `llmBus.emit("crash", code)` puis `scheduleRestart()`
- `isModelReady = true` → `llmBus.emit("ready")`
- `resetLLM()` → `llmBus.emit("reset")`

La queue (`requestQueue`) garde sa logique actuelle (index pointer O(1)), mais plus besoin de stocker `callbacks` :

```typescript
interface QueueItem {
  userMessage: UserMessage;
  resolve: (value: string) => void;
  reject: (reason: unknown) => void;
}
```

### Changements dans `bot.ts`

```typescript
// Au lieu de passer callbacks à askLLM
const fullText = await askLLM({ username: displayName, text: content });

// Pour le typing, écouter le premier token
if (!isVoice) {
  llmBus.once("token", startTyping);
}
```

## 3. `state/state-bus.ts` — Événements d'état

```typescript
export type StateBusEvents = {
  "state:changed": [];
};

export const stateBus = new TypedBus<StateBusEvents>();
```

### Changements dans `state.ts`

Chaque mutation émet `stateBus.emit("state:changed")` :

- `setPaused(v)` → après `paused = v`
- `markReplied(channelId)` → après mutations
- `markBotActivity(channelId)` → après mutation
- `trackSpeaker(...)` → après mutation
- `clearCooldown(channelId)` → après mutations
- `restoreState(...)` → après restore

### Changements dans `persistence.ts`

Au démarrage :

```typescript
import { stateBus } from "./state-bus.js";
import { dumpState } from "./state.js";

stateBus.on("state:changed", () => {
  scheduleSave(buildFullState());
});
```

`buildFullState()` combine `dumpState()` + `buildPending(pendingMessages)` (importé depuis `bot/pending.ts`).

**Conséquence :** plus aucun `saveAllState()` manuel dans `bot.ts` ou `bot/pending.ts`. La persistance se déclenche automatiquement.

## 4. Suppressions

### `config.ts` — Constantes déplacées

`replyInDM` est une constante booléenne dérivée de la config. Déplaçable dans config.ts si besoin, ou gardée sur place.

### `state/state.ts` — `canFollowUp` et `inConversation`

Ces fonctions trigger des reads, pas des writes — aucun changement nécessaire. Elles ne mutent pas l'état.

## Ordre d'implémentation

| # | Fichier | Action |
|---|---|---|
| 1 | `core/bus.ts` | Créer le bus générique |
| 2 | `core/llm-bus.ts` | Créer le bus LLM typé |
| 3 | `core/llm-core.ts` | Émettre les events, retirer les callbacks de `askLLM()` |
| 4 | `bot.ts` | Écouter `llmBus.once("token", startTyping)` au lieu de `onFirstToken` |
| 5 | `state/state-bus.ts` | Créer le bus state |
| 6 | `state/state.ts` | Émettre `state:changed` après chaque mutation |
| 7 | `state/persistence.ts` | Écouter `state:changed` et auto-sauver |
| 8 | `bot.ts`, `bot/pending.ts` | Supprimer tous les `saveAllState()` manuels |

## Risques

- **Dépendances circulaires** : vérifier que `persistence.ts` n'importe pas `state.ts` qui importerait `persistence.ts`. Solution : `stateBus` est dans un fichier à part, `state.ts` l'importe, `persistence.ts` aussi, pas de cercle.
- **Un seul `TypedBus` global** : intentionnel — pas de fuite, pas de `on/off` éparpillé.
- **`askLLM()` sans callbacks** : le `Promise` resolve toujours à la fin, donc async/await inchangé. Les events sont un canal supplémentaire, pas un substitut.
