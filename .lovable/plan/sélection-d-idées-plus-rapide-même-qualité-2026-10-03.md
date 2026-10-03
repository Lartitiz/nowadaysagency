# Sélection d'idées plus rapide, même qualité

## Ce qui prend du temps aujourd'hui
La sélection enchaîne trois appels IA l'un après l'autre, tous sur le modèle le plus lent (Opus) :
1. Exploration : 6 pistes (jusqu'à environ 60 s)
2. Recherche web pour vérifier des affirmations (jusqu'à 25 s), sur Opus elle aussi
3. Rédaction complète des 4 idées en un seul bloc (jusqu'à 8 500 tokens, 120 s) : l'étape la plus longue

## Ce qui change (la qualité d'écriture reste sur Opus)
1. **Rédaction des 4 idées en parallèle** : l'exploration désigne et classe déjà les 4 meilleures pistes (consigne de tri actuelle conservée : écarter le générique, les promesses absolues, les conseils remaquillés). Chaque idée est ensuite rédigée par son propre appel Opus, avec les mêmes règles éditoriales et le même format. Les quatre tournent en même temps : on attend la plus lente, pas la somme.
2. **Recherche web sur Sonnet** : cette étape ne fait que trouver et résumer des sources, elle n'écrit rien de visible. Elle est sautée quand aucune affirmation n'est à vérifier.
3. **Contexte commun mis en cache** : la matière de l'activité, identique pour chaque appel, est relue depuis le cache plutôt que retraitée à chaque fois.
4. « Approfondir une idée » garde son déroulé actuel (une seule idée), avec le cache et la recherche sur Sonnet.

Gain attendu : environ 2 à 3 fois plus rapide (de 2-3 min à moins d'une minute environ). C'est une estimation : je la mesurerai dans les journaux après déploiement.

## Garde-fous
- Si une rédaction parallèle échoue ou fait doublon avec une autre, elle est relancée une seule fois sur la 5e ou 6e piste ; sinon même message d'erreur qu'aujourd'hui.
- Toujours un seul crédit décompté pour la sélection (checkQuota avant, logUsage après succès, tokens additionnés).
- Le message d'attente de la fenêtre et le délai côté écran sont ajustés au nouveau temps.

## Détails techniques
- `supabase/functions/_shared/ideas/pipeline.ts` : la préparation renvoie `ranked` (4 index + 2 de réserve) ; la sélection devient `Promise.all` de 4 appels `count=1` (max_tokens environ 2 200, timeout 90 s), contrôle de doublon des sujets, une relance sur réserve.
- `research.ts` : modèle Sonnet via `getModelForAction`, sortie immédiate si `queries` est vide.
- Le contexte passe dans un bloc système avec `cache_control` partagé entre les étapes (vérifier le support dans `_shared/anthropic.ts`).
- `ContentCoachingDialog.tsx` : timeout passé de 220 s à environ 150 s, texte d'attente adapté.
- Mise à jour de `pipeline_test.ts` : 4 appels parallèles, relance sur doublon, recherche sautée sans requête.
- Déploiement de `content-coaching` uniquement après ton accord ; site non publié.
