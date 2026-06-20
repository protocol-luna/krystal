# IDEAS — Améliorations du réalisme humain

## Comportement de "frappe"
- [x] Délai entre chunks basé sur un WPM "humain" (au lieu des délais fixes actuels) [Implémenté : config.typingWpm, 300 WPM par défaut]
- [x] Commencer par une hésitation aléatoire ("Uh...", "Um...", "Well...", "I mean...") [Implémenté : hesitationChance, configurable]
- [x] Ajouter un délai de "lecture" proportionnel à la longueur du message auquel on répond [Implémenté : msgLength dans computeDelay]

## Corrections et erreurs
- ~~[/] Fautes de grammaire intentionnelles (rare, type "j'ai vu" → "j'ai vue") [Trop d'effort, LLM en fait déjà naturellement]~~
- [~] Auto-correction "humaine" (corriger un doigt qui a dérapé entre deux mots différents, pas seulement adjacent) [Passé en ~, trop d'effort pour le rendu]
- ~~[~] Changer d'avis : éditer le message après envoi pour ajouter/supprimer un mot [Barré — trop d'effort pour un détail quasi imperceptible]~~
- [x] Oubli de répondre malgré trigger (probabilité faible) [Implémenté : forgetChance dans config]

## Contexte temporel et humeur
~~- [~] Ton adapté à l'heure : plus fatiguée / irritable le soir, plus énergique le matin [Barré — injection ignorée par le modèle, restart trop lourd]~~
~~- [~] Humeur simulée persistante (joie, fatigue, irritation) qui évolue dans le temps [Barré — idem]~~
~~- [~] Réponses plus courtes en fin de journée [Barré — idem]~~
~~- [~] Sujets basés sur le jour de la semaine / saison / météo [Barré — nécessite API + restart, trop lourd]~~
[[Les paramètres de contextes pourrait être sympas si on utilisait la version server de llama.cpp, hors ici on hi-jack la version client. C'est une constraint qui pousse à garder le contexte sans tout analyser à chaque fois, et llama-cli répond plus rapidement que llama-server, surout sans GPU. A creuser]]

## Présence et disponibilité
- [x] Statut Discord dynamique (en ligne, occupé, "regarde un film...") [Implémenté : dynamic_status_presets rotatif]
- ~~[!] Périodes "hors ligne" ou "occupée" en dehors du sommeil (ne répond pas pendant X minutes) [Barré — déjà couvert par sleep + shouldIgnore + forgetChance]~~
- [x] Temps de réponse plus long si inactif depuis longtemps (simule le "réveil") [Implémenté : inactivityMs dans computeDelay]
- ~~[?] Interruptible : si on lui parle pendant qu'elle répond, elle peut s'arrêter ou changer de sujet [Déprécié — l'anti-spam gère déjà ce cas]~~

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