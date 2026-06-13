## Contexte métier

À l'étape "structure" d'un carrousel (avant les slides), si l'utilisatrice est à court de crédits, carousel-ai renvoie un 429 SANS l'objet `quota` complet. Le QuotaWallModal s'ouvre alors sans le bilan détaillé du mois — alors que l'étape "slides" (carousel-visual), elle, l'a déjà (corrigé précédemment). Incohérence d'expérience entre les deux étapes du même flow carrousel.

Objectif : carousel-ai renvoie le même format que carousel-visual, avec l'objet quota.

## Fichiers impactés

- supabase/functions/carousel-ai/index.ts (UNIQUEMENT — le bloc de réponse 429 quota)

## Comportement attendu

1. Localiser le bloc `if (!quotaCheck.allowed)` (~ligne 104) qui renvoie actuellement :
  `{ error: "limit_reached", message: quotaCheck.message, remaining: 0, category: quotaCheck.reason }`
2. Le remplacer pour inclure l'objet quota complet, en conservant la sentinelle :
  `{ error: "limit_reached", message: quotaCheck.message, quota: quotaCheck }`
   (handleQuotaError lit `quota.reason` et `quota.usage` pour alimenter le modal ;
   l'ancien `remaining`/`category` était redondant et incomplet.)
3. Vérifier que la variable de retour de checkQuota dans cette fonction s'appelle bien `quotaCheck` (sinon adapter le nom). NE PAS renommer la variable.

## Ce qui NE DOIT PAS bouger

- La logique de checkQuota elle-même, le calcul de `category` (suggestion vs content) : NE PAS TOUCHER.
- Tout le reste de carousel-ai (génération structure, slides texte, getUserContext, contexte branding, series) : NE PAS TOUCHER.
- Le status HTTP reste 429.
- carousel-visual : déjà corrigé, NE PAS TOUCHER.
- Aucun changement front nécessaire (handleQuotaError + use-content-generator gèrent déjà `error === "limit_reached"` et lisent `data.quota`).

## Critères de validation

1. `npx tsc --noEmit --skipLibCheck` passe sans erreur (côté repo front, inchangé).
2. Test manuel (compte à 0 crédit) : lancer une génération de carrousel photo/mix (qui passe par l'étape structure) → le QuotaWallModal s'ouvre AVEC le bilan du mois.
3. Test manuel régression : avec crédits dispo, la proposition de structure fonctionne normalement.

## Proposition d'améliorations (optionnel)

Si d'autres `status: 429` (rate-limit Anthropic, overload 529) qui mériteraient un typage cohérent sont repérés dans carousel-ai, ils seront signalés sans être implémentés. ok

## Hors scope (plans séparés à venir)

- Harmonisation des ~10 autres edge functions à 429 artisanal.
- Suppression de useFormPersist.