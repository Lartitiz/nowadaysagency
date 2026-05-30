Trois corrections, par ordre d'impact attendu :

## 1. (Impact 80%) Brancher la passe de correction LinkedIn sur `creative-flow`

`supabase/functions/_shared/correction-pass.ts` contient déjà `CORRECTION_PROMPTS.linkedin` qui traque cascades, énumérations parfaites, formules manufacturées, anaphores, CTA génériques. Il est utilisé par `carousel-ai` mais **PAS** par `creative-flow`.

Dans `supabase/functions/creative-flow/index.ts`, après la génération photo→LinkedIn (autour de la ligne 1306, après `callAnthropic`) :
- Importer `applyCorrection` depuis `../_shared/correction-pass.ts`
- Parser `rawContent`, extraire `content`, appeler `applyCorrection({ format: "linkedin", content, ... })`
- Réinjecter le résultat corrigé dans la réponse
- Faire pareil pour le mode texte pur (step=generate sans photo, branche `else`) quand `contentType === post_linkedin`

Coût : 1 appel Claude Sonnet supplémentaire (~3-5s, <0.01€). Le gain est massif : c'est une 2ᵉ passe spécialisée qui ne fait QUE chasser le slop.

## 2. (Impact 15%) Réordonner le user prompt photo

Dans `creative-flow/index.ts:1263-1298`, l'ordre actuel est `[images..., texte brief]`. Changer pour :
```
[bloc "RÈGLES CRITIQUES" (anti-paraphrase + anti-cascade, ~15 lignes max),
 images...,
 brief format + anti-fabrication + jsonShape]
```
Claude lit l'interdit AVANT de traiter visuellement les images. Les patterns "ce flyer…" sont moins amorcés.

## 3. (Impact 5%) Baisser la temperature pour LinkedIn

Dans `creative-flow/index.ts:1304`, passer `temperature: 0.85` → `0.7` **uniquement quand `contentType` contient "linkedin"**. Garder 0.85 pour caption Instagram / reel / stories où la créativité aide.

## Ce qu'on NE fait PAS
- Pas de refonte d'`ANTI_SLOP` (déjà tenté, ça ne résout pas le vrai problème : pas de passe aval)
- Pas de changement sur les autres formats (newsletter, reel, story, caption) tant qu'on n'a pas validé l'effet sur LinkedIn
- Pas de changement frontend

## Vérification après build
- Logs `[correction-pass:linkedin]` doivent apparaître dans `creative-flow` logs
- Re-générer le post sur les 3 mêmes photos. Critères : zéro "Ce [adjectif] [objet], c'est…", zéro cascade, longueur ≤ 1100, chiffres visibles exacts.
