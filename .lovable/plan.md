## Diagnostic

Quand tu cliques sur "Rédiger" depuis la Boîte à idées, le sujet de l'idée est bien passé dans l'URL (`?sujet=...`), mais l'IA pose des questions hors-sujet (ex : "étudiants des Beaux-Arts" alors que l'idée portait sur autre chose).

J'ai audité le parcours complet :

1. **`IdeasPage.tsx → handleRediger`** : le sujet (`titre` de l'idée) est bien passé via `?sujet=...` ✅
2. **`CreerUnifie.tsx → init effect`** : récupère `paramSujet` et le pose dans `ideaText` ✅
3. **`handleFormatNext`** : appelle `generateQuestions({ subject: enrichedSubject, ... })` ✅
4. **`use-content-generator.ts → generateQuestions`** : ajoute un bloc `recentBriefsContext` (3 briefs récents avec leurs sujets ET la "réponse marquante" la plus longue) au prompt envoyé à l'IA.
5. **Edge function `creative-flow` (step=questions)** : si pas de `recent_briefs_context` dans le body, en re-fetch un côté serveur. Le prompt système contient des règles fortes type "ÉVITE les angles déjà couverts" et cite des extraits de réponses précédentes.

### Cause racine

L'historique des briefs récents domine le prompt. J'ai vérifié en base :
- Le brief le plus récent a un `subject` **vide** mais des réponses très longues qui parlent de ses stickers, de sa "lecture cachée", etc.
- Les "réponses marquantes" extraites (jusqu'à 180 caractères chacune × 3 briefs) sont concaténées dans le prompt et **mélangées avec la consigne "fais écho discrètement"**.
- Résultat : Claude fabrique des questions qui mixent ton sujet courant avec des bouts de scènes anciennes (les "Beaux-Arts" sortent probablement d'une scène d'un ancien brief ou d'un mélange entre `cible`, `activité` et une réponse passée).

Le sujet courant est **présent** dans le prompt (ligne `Sujet : ${context}`), mais il est noyé : règle 1 dit "questions liées à CE sujet", mais 4 autres règles parlent de "mémoire", "écho", "ne re-demande pas", et le bloc `HISTORIQUE RÉCENT` cite textuellement des réponses passées plus longues que le sujet lui-même.

### Bug secondaire

Le brief le plus récent en base a `subject = ""` (vide). Quelque chose enregistre les briefs sans sujet, ce qui pollue l'historique et la sortie IA.

---

## Plan

### 1. Recentrer le prompt `questions` sur le sujet courant
Dans `supabase/functions/creative-flow/index.ts` (step `questions`) :
- Mettre le `Sujet : ${context}` **en début de prompt**, dans un bloc `══ SUJET COURANT (PRIORITÉ ABSOLUE) ══`, avant le bloc `recentBriefsContext`.
- Reformuler la règle 1 pour être beaucoup plus stricte : "Si une question ne contient pas un mot du sujet courant ou un aspect concret du sujet courant, elle est invalide."
- Réduire le rôle de l'historique : passer de "ÉVITE les angles déjà couverts" + "fais écho" à uniquement "ne pose pas la même question qu'un brief précédent". Pas d'écho, pas de mélange.

### 2. Réduire le poids de l'historique côté client
Dans `src/hooks/use-content-generator.ts → generateQuestions` :
- Ne plus envoyer la "réponse marquante" complète des briefs précédents (180 chars × 3) — juste les sujets/angles/formats.
- Cap dur à ~1500 chars (au lieu de 5800) pour le `recentBriefsContext`.
- Filtrer les briefs sans `subject` non vide.

### 3. Même traitement côté `carousel-ai`
Dans `supabase/functions/carousel-ai/index.ts` (type `deepening_questions`), appliquer les mêmes principes : sujet courant en premier, historique allégé.

### 4. Empêcher la sauvegarde de briefs vides
Dans `CreerUnifie.tsx → handleQuestionsNext` : ne pas insérer dans `content_briefs` si `ideaText.trim() === ""`. Évite la pollution future.

### 5. Vérification
Refaire le parcours Idées → Rédiger sur 2-3 idées différentes et vérifier que les 3 questions générées contiennent toutes au moins un mot-clé du titre de l'idée.

---

## Détails techniques

- Fichiers touchés : `supabase/functions/creative-flow/index.ts`, `supabase/functions/carousel-ai/index.ts`, `src/hooks/use-content-generator.ts`, `src/pages/CreerUnifie.tsx`.
- Pas de migration DB nécessaire.
- Pas de changement d'API publique des hooks.
- Les briefs déjà sauvegardés sans sujet resteront en base mais seront filtrés à la lecture.
