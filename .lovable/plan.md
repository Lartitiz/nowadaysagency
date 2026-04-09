

# Audit scope bugs — Résultat et refactoring recommandé

## Résultat de l'audit

J'ai analysé les **80+ Edge Functions** du projet. Seul `creative-flow/index.ts` avait ce type de bug de scope. Les autres fonctions qui utilisent des variables `is*` (generate-content, carousel-visual, coach-chat, etc.) les utilisent toujours dans le même bloc où elles sont définies.

**Le fix actuel (`streamIsLinkedIn`) fonctionne**, mais la logique de détection LinkedIn est dupliquée à deux endroits (ligne 298-303 et ligne 954-955). Si quelqu'un modifie l'un sans l'autre, le bug reviendra.

## Refactoring recommandé

**Déplacer les variables `is*` format au scope supérieur** (avant les blocs `if (step === ...)`) pour qu'elles soient accessibles partout dans la fonction.

### Fichier : `supabase/functions/creative-flow/index.ts`

1. **Déplacer les const `isLinkedIn`, `isCarousel`, `isReel`, etc.** juste après la ligne 171 (`let userPrompt`), en utilisant les mêmes sources de données (`angle`, `contentType`)
2. **Supprimer la déclaration dupliquée** des mêmes variables à l'intérieur du bloc `generate` (lignes 298-307)
3. **Supprimer `streamIsLinkedIn`** (lignes 954-955) et utiliser `isLinkedIn` directement
4. Résultat : une seule source de vérité pour la détection du format

### Ce qui ne change pas
- La logique de détection (même conditions exactes)
- Le comportement du streaming LinkedIn (2 appels séquentiels)
- Les autres steps (angles, questions, adjust, recycle, dictation)
- Le correctionPrompt et ses règles

