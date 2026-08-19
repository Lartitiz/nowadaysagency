# Voir les questions de coaching s'écrire au fur et à mesure

## Le problème

Aujourd'hui, quand tu réponds à une question du coaching branding, l'app attend la réponse **complète** de l'IA avant d'afficher quoi que ce soit : un spinner tourne, avec une phrase d'attente.

Or cette réponse ne contient pas seulement la question suivante : elle contient aussi tout ce que l'IA extrait de ta réponse précédente (les insights, la progression, les sujets couverts) — une réponse qui peut monter jusqu'à 8000 tokens. La question, elle, fait deux lignes et est générée dans les toutes premières secondes.

Résultat : tu attends la fin d'une génération longue pour lire une phrase qui était prête depuis longtemps.

## Ce qu'on fait

Afficher la question **pendant** qu'elle s'écrit, comme dans une conversation, au lieu d'attendre la fin.

Concrètement :
- Dès que les premiers mots de la question arrivent, ils s'affichent à l'écran et se complètent progressivement (effet machine à écrire naturel, pas simulé).
- Le champ de réponse, les options et le bouton n'apparaissent qu'une fois la question terminée — pour ne pas répondre à une question à moitié écrite.
- Le reste du travail de l'IA (extraction des insights, progression, checklist) continue en arrière-plan et se met à jour ensuite, sans bloquer la lecture.
- Le spinner actuel ne reste que pour le tout début (avant le premier mot).
- En cas de coupure ou de réponse incomplète, on retombe sur le comportement actuel (message d'erreur + bouton Réessayer), donc pas de régression.

Gain attendu : la question devient lisible en 1 à 3 secondes au lieu d'attendre la génération entière.

## Périmètre

Étape 1 — Le coaching branding (les 6 sections : histoire, persona, proposition de valeur, ton & combats, stratégie de contenu, offres). C'est là que l'attente est la plus longue et la plus fréquente.

Étape 2 (une fois validé sur le branding) — Le même traitement pour les autres questionnaires guidés : coaching de contenu avant génération, coaching charte, coaching offres.

Je propose de faire l'étape 1 d'abord, la vérifier en vrai, puis étendre.

## Détails techniques

- Le projet a déjà tout le nécessaire : `_shared/anthropic-stream.ts` (avec `streamAnthropicToolSSE` et le décodage des fragments `input_json_delta`) côté serveur, et `src/lib/invoke-with-heartbeat.ts` côté client (lecture SSE, callback `onStatus`). Les fonctions `creative-flow`, `carousel-ai`, `chat-guide` et `coaching-module` utilisent déjà ce pattern.
- `supabase/functions/branding-coaching/index.ts` : l'appel principal passe de `callAnthropicWithMeta` (bloquant, `max_tokens: 8000`, outil `COACHING_TOOL`) à la variante streaming. Pendant l'assemblage des fragments `partial_json`, la fonction extrait au fil de l'eau la valeur de la clé `question` et l'émet vers le client via des events SSE (`{ type: "question_delta", text }`), puis termine par l'event `done` avec le JSON complet — même payload qu'aujourd'hui.
- La clé `question` doit rester la **première** propriété du schéma `COACHING_TOOL` pour être streamée en premier ; le reste du schéma, la validation (`isAIResponseShapeInvalid`), la relance en cas de troncature et le `logUsage` ne changent pas.
- Côté client, `BrandingCoachingFlow.tsx` : `askAI` passe de `invokeWithTimeout("branding-coaching", …, 250000)` à `invokeWithHeartbeat` avec un callback qui alimente un nouvel état `streamingQuestion`. Le rendu affiche `streamingQuestion` dès qu'il est non vide, et n'affiche les contrôles de réponse qu'à réception de l'event `done`. Les chemins d'erreur, le retry et la persistance des insights restent inchangés.
- Bénéfice secondaire : le flux SSE tient la connexion ouverte, ce qui supprime le risque de coupure proxy sur les sessions longues.
