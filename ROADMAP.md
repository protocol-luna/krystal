# Roadmap — Fonctionnalités de réalisme humain

## 1. Délai inter-chunks

**Problème** : actuellement, tous les chunks de la réponse LLM sont envoyés instantanément les uns après les autres. Un humain mettrait du temps à écrire chaque message.

**Solution** : ajouter un délai variable configurable entre l'envoi de chaque chunk.

```yaml
# config.yml
chunk_delay_min: 300       # ms
chunk_delay_max: 1500      # ms
```

Le délai peut être influencé par la longueur du chunk (plus un message est long, plus il prend de temps à écrire).

**Fichiers** : `bot.ts` — `triggerLunaReply`, boucle d'envoi des chunks.

---

## 2. Plages de sommeil / présence variable

**Problème** : le bot répond 24h/24. Un humain ne serait pas actif à toute heure.

**Solution** : configurer des plages horaires où le bot adapte son comportement.

```yaml
# config.yml
sleep_schedule:
  enabled: true
  start: "23:00"              # 11 PM
  end: "08:00"                # 8 AM
  timezone: "Europe/Paris"    # fuseau horaire
  behavior: "sleep"           # sleep | slow | short
```

Comportements possibles :

| Mode | Effet |
|------|-------|
| `sleep` | Aucune réponse (le bot "dort") |
| `slow` | Délais beaucoup plus longs (x3–x5), ignore chance augmenté, réactions désactivées |
| `short` | Réponses très courtes, pas de follow-up, le bot "répond à moitié endormi" |

Hors plages de sommeil, comportement normal.

**Fichiers** : `config.ts`, `mannerisms.ts`, `bot.ts` (dans le handler `messageCreate`, vérifier avant de répondre).

---

## 3. Simulation de typos + correction (edit)

**Problème** : les humains font des fautes de frappe et les corrigent. Le bot est trop parfait.

**Solution** : avec une certaine probabilité, introduire une faute de frappe réaliste (touche adjacente sur le clavier), puis éditer le message après un court délai pour la corriger.

```yaml
# config.yml
typo_chance: 0.06             # probabilité par message
typo_correction_delay: 2000   # ms avant correction (min)
typo_correction_delay_max: 4000  # ms avant correction (max)
typo_layout: "azerty"         # azerty | qwerty
```

**Principe** :
1. Le bot envoie un message normal
2. Avec `typo_chance`, on introduit une faute de frappe sur un mot aléatoire du message :
   - Remplacement d'une lettre par une touche adjacente (layout AZERTY/QWERTY)
   - Doublon de lettre (ex. "bonjour" → "bonj our")
   - Inversion de lettres (ex. "le" → "el")
3. Après `typo_correction_delay` ms, le bot édite le message pour corriger la faute
4. Si le message est déjà édité manuellement par quelqu'un, on annule

**Mapping AZERTY** (exemple partiel) :
```
a → z/q, z → a/e, e → z/r, r → e/t, t → r/y, y → t/u, u → y/i, i → u/o, o → i/p...
```

**Mapping QWERTY** :
```
q → w/a, w → q/e/s, e → w/r, r → e/t, t → r/y, y → t/u, u → y/i, i → u/o, o → i/p...
```

**Fichiers** : nouveau fichier `src/typo.ts` (mapping + logique), modification de `bot.ts` (éditer le message après l'envoi).

---

## 4. Concentration variable / attentiveness ✅

**Problème** : le bot réagit de la même façon quel que soit le type de déclencheur. Un humain est plus attentif quand on l'appelle directement que quand il capte un mot-clé au hasard.

**Solution** : paramétrer le comportement (délai, ignore chance, reaction chance) en fonction de la raison du trigger. Implémenté dans `mannerisms.ts`.

| Trigger | Delai min | Delai max | Ignore chance | Reaction chance |
|---------|-----------|-----------|---------------|-----------------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 3000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

**Fichiers** : `mannerisms.ts` — `computeDelay(reason)`, `shouldReact(reason)`. `bot.ts` — passage de `reason` à `triggerLunaReply` et aux fonctions mannerisms.

**Statut : ✅ Implémenté**.

---

## 5. Gestion des interruptions / file de messages ✅

**Problème** : si un utilisateur envoie plusieurs messages pendant que le bot génère une réponse, les messages suivants sont ignorés (anti-spam `Set`). On perd le contexte de ce que l'utilisateur a vraiment dit en dernier.

**Solution** : remplacer le `Set<string>` par deux structures :
- `processing: Set<string>` — requêtes en cours pour un (channel, user)
- `pendingMessages: Map<string, Message>` — dernier message reçu pour un (channel, user)

**Principe** :
1. msg1 arrive → `triggerLunaReply` démarre, `processing.add("C:U")`
2. msg2 arrive → `processing.has("C:U")` → stocké dans `pendingMessages["C:U"] = msg2`, retour immédiat
3. msg3 arrive → écrase msg2 dans `pendingMessages["C:U"] = msg3`
4. La réponse à msg1 se termine → `finally` → `processing.delete("C:U")` → vérifie `pendingMessages` → trouve msg3 → lance `triggerLunaReply(msg3)`

**Résultat** : 20 messages spammés = 1 réponse au premier + 1 réponse au dernier. La queue LLM ne grossit jamais.

**Fichiers** : `bot.ts` — `triggerLunaReply`.

**Statut : ✅ Implémenté**.

---

## Ordre de priorité suggéré

1. **✅ Gestion des interruptions** (#5) — implémenté
2. **✅ Concentration variable** (#4) — implémenté
3. **Délai inter-chunks** (#1) — simple, effet visible
4. **Plages de sommeil** (#2) — indépendant, ajoute une couche de configuration
5. **Typos + correction** (#3) — le plus complexe (mapping clavier, logique d'edit, gestion des races)
