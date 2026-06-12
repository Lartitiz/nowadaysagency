## Objectif

Supprimer l'ancien pipeline `newsletter-ai` (deprecated juin 2026), désormais sans appelant vivant. La génération de newsletter passe entièrement par `creative-flow` via le chemin streaming. On nettoie pour garantir le principe single source of truth.

## Modifications

### 1. src/hooks/use-content-generator.ts

Deux retraits, strictement bornés au chemin non-streaming de `generate()` :

- **Ligne 198** — retirer `"newsletter"` de la constante `SUPPORTED` :
  ````text
  const SUPPORTED = ["carousel", "reel", "story", "post", "linkedin"] as const;
  ````
  Conséquence : si quelqu'un appelle par erreur `generate({ format: "newsletter" })`, on tombe sur la garde existante (toast clair "Choisis un format valide…") au lieu d'atteindre un edge function supprimé.

- **Lignes 384-402** — supprimer le `case "newsletter": { … break; }` complet du switch.

Restent **intacts** :
- Les unions de types `GenerateParams.format` (ligne 20) et `ContentResult.type` (ligne 84) — `"newsletter"` y reste car le résultat de génération streaming est typé pareil.
- Le chemin streaming complet : `generateStream()` lignes 690+, le mapping `format → contentType` (`newsletter: "post_newsletter"` ligne 719), l'union `StreamParams.format` ligne 848.
- Tous les autres cases du switch (carousel, reel, story, post, linkedin).

### 2. supabase/functions/newsletter-ai/

Supprimer le dossier complet (`index.ts` est le seul fichier).

Après suppression, appeler `supabase--delete_edge_functions(["newsletter-ai"])` pour retirer aussi la fonction déployée.

Les fichiers `_shared/` (correction-pass.ts, copywriting-prompts.ts, plan-limiter.ts…) ne sont **pas** touchés — ils servent d'autres fonctions.

### 3. src/components/creer/formatRenderers/NewsletterResult.tsx

Le schéma `creative-flow` newsletter ne contient plus `personalization_level`. Nettoyer :

- **Ligne 19** — supprimer `const personalizationLevel = result?.personalization_level;`
- **Lignes 95-106** — supprimer le bloc `{personalizationLevel && (…)}` dans la section Meta.
- **Lignes 92-107** — la `<div>` Meta est conservée, ne contient plus que `wordCount`.

Le reste du renderer (subject, preview_text, body, cta_suggestion, copySubject, copyAll, RedFlagsChecker, AiGeneratedMention) est **strictement identique**.

## Améliorations connexes identifiées

(b) **Proposition non incluse dans le plan** — `src/lib/content-structures.ts` ligne 531 contient encore `edgeFunction: "newsletter-ai"` dans le registry des formats. Ce champ n'est lu à l'exécution par aucun fichier (`grep .edgeFunction src/` = vide), c'est purement déclaratif. Le mettre à jour en `"creative-flow"` resterait cohérent avec la réalité, mais ce n'est pas requis pour le fonctionnement et tu as listé seulement 3 fichiers impactés. À valider à part si tu veux l'inclure ; je ne le touche pas dans cet exec.

Aucune autre amélioration identifiée dans le périmètre.

## Ce qui ne bouge pas

- `supabase/functions/creative-flow/index.ts`
- `supabase/functions/_shared/*`
- Le chemin streaming newsletter de bout en bout (generateStream → use-streaming-invoke → creative-flow "post_newsletter" → NewsletterResult)
- Les autres cases de `generate()` et leurs edge functions
- Les autres renderers

## Validation

- `npx tsc --noEmit --skipLibCheck` passe sans erreur
- `grep -rn "newsletter-ai" src/ supabase/functions/` ne retourne plus rien (sauf éventuellement la ligne `content-structures.ts:531` si on n'inclut pas la proposition (b) — à confirmer avec toi)
- Test manuel : générer une newsletter depuis Créer → résultat complet avec objet + preview + body, sauvegarde calendrier et idée OK
- Test manuel : générer un post, un LinkedIn, un carrousel → comportements inchangés
- Le dossier `supabase/functions/newsletter-ai/` n'existe plus et la fonction est désinscrite côté backend