# IDEAS — Améliorations du réalisme humain

## Comportement de "frappe"
- [ ] Streamer le message lettre par lettre (au lieu de chunks) avec délai type "wpm" humain
- [ ] Commencer par une hésitation aléatoire ("Euh...", "Hmm...", "Bah...", "Bon...")
- [ ] Ajouter un délai de "lecture" proportionnel à la longueur du message auquel on répond

## Corrections et erreurs
- [ ] Fautes de grammaire intentionnelles (rare, type "j'ai vu" → "j'ai vue")
- [ ] Auto-correction "humaine" (corriger un doigt qui a dérapé entre deux mots différents, pas seulement adjacent)
- [ ] Changer d'avis : éditer le message après envoi pour ajouter/supprimer un mot
- [ ] Oubli de répondre malgré trigger (probabilité faible)

## Contexte temporel et humeur
- [ ] Ton adapté à l'heure : plus fatiguée / irritable le soir, plus énergique le matin
- [ ] Humeur simulée persistante (joie, fatigue, irritation) qui évolue dans le temps
- [ ] Réponses plus courtes en fin de journée
- [ ] Sujets basés sur le jour de la semaine / saison / météo

## Présence et disponibilité
- [ ] Statut Discord dynamique (en ligne, occupé, "regarde un film...")
- [ ] Périodes "hors ligne" ou "occupée" en dehors du sommeil (ne répond pas pendant X minutes)
- [ ] Temps de réponse plus long si inactif depuis longtemps (simule le "réveil")
- [ ] Interruptible : si on lui parle pendant qu'elle répond, elle peut s'arrêter ou changer de sujet

## Interaction
- [ ] Répondre avec des messages vocaux via TTS aléatoirement
- [ ] Réagir avec des emojis personnalisés du serveur plus souvent
- [ ] Lancer des sujets de conversation spontanés basés sur le contexte récent

## Technique
- [x] Auto-restart du processus llama-cli en cas de crash (exponential backoff, max 5 tentatives)
- [ ] Configurer la concentration (ignoreChance, réaction, délai) depuis config.yml au lieu de hardcodé dans mannerisms.ts
- [ ] Tests unitaires pour chaque module
