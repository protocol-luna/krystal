# IDEAS — Améliorations du réalisme humain

## Comportement de "frappe"
- [?] Streamer le message lettre par lettre (au lieu de chunks) avec délai type "wpm" humain
- [/] Commencer par une hésitation aléatoire ("Euh...", "Hmm...", "Bah...", "Bon...") [Cause de la dépréciation: le message peut être généré en anglais, donc pas optimal]
- [~] Ajouter un délai de "lecture" proportionnel à la longueur du message auquel on répond

## Corrections et erreurs
- [/] Fautes de grammaire intentionnelles (rare, type "j'ai vu" → "j'ai vue") [Cause dépréciation: la meme qu'en haut]
- [@] Auto-correction "humaine" (corriger un doigt qui a dérapé entre deux mots différents, pas seulement adjacent)
- [~] Changer d'avis : éditer le message après envoi pour ajouter/supprimer un mot [Utilité a faire ça ?]
- [!] Oubli de répondre malgré trigger (probabilité faible)

## Contexte temporel et humeur
- [~] Ton adapté à l'heure : plus fatiguée / irritable le soir, plus énergique le matin [L'idée est bonne mais le prompt systeme devrait changer pour ca, ca necessiterait un redémarrage de llama-cli juste pour ajouter ça au prompt, je suis pas sur que ca soit optimisable autrement]
- [~] Humeur simulée persistante (joie, fatigue, irritation) qui évolue dans le temps [Pareil qu'en haut]
- [?] Réponses plus courtes en fin de journée [Cause: on devrait piloter le system prompt pour ça non ?]
- [?] Sujets basés sur le jour de la semaine / saison / météo [Prompt a modifier?]
[[Les paramètres de contextes pourrait être sympas si on utilisait la version server de llama.cpp, hors ici on hi-jack la version client. C'est une constraint qui pousse à garder le contexte sans tout analyser à chaque fois, et llama-cli répond plus rapidement que llama-server, surout sans GPU. A creuser]]

## Présence et disponibilité
- [!] Statut Discord dynamique (en ligne, occupé, "regarde un film...") [j'aime l'idée, les status devront etre en anglais mais j'aime l'idée]
- [!] Périodes "hors ligne" ou "occupée" en dehors du sommeil (ne répond pas pendant X minutes) [L'idée est bonne mais elle ne devrait pas rentrer en conflit avec la précédente]
- [!] Temps de réponse plus long si inactif depuis longtemps (simule le "réveil") [L'idée est excellente]
- [?] Interruptible : si on lui parle pendant qu'elle répond, elle peut s'arrêter ou changer de sujet [A creuser, ca serait une génération inutile de faite, et le systeme anti-spam propose déjà une solution pour ce genre de problemes non ?]

## Interaction
- [x] Répondre avec des messages vocaux via TTS aléatoirement 
- [x] Réagir avec des emojis personnalisés du serveur plus souvent
- [x] Lancer des sujets de conversation spontanés basés sur le contexte récent

## Technique
- [x] Auto-restart du processus llama-cli en cas de crash (exponential backoff, max 5 tentatives)
- [x] Configurer la concentration (ignoreChance, réaction, délai) depuis config.yml au lieu de hardcodé dans mannerisms.ts
- [!] Tests unitaires pour chaque module

x - fait
! - priorité
~ - intéressant, mais pas priorité
/ - déprécié
? - pas compris
@ - dis m'en plus ?