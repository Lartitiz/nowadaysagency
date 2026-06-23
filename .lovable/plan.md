## Objectif
Fix bug "même photo sur tous les slides" lors de l'export PPTX d'un carrousel photo/mix : ajouter un filet déterministe côté backend + durcir le fallback côté export.

## Diagnostic confirmé
- `supabase/functions/carousel-ai/index.ts` renvoie le `content` brut de l'IA pour les modes `photo` (l.311) et `mix` (l.243), juste après `applyCorrectionPassCarousel`. Aucune normalisation de `photo_index`.
- `src/lib/export-carousel-pptx.ts` l.259-260 et l.373-374 : `photos[photoIdx] || photos[0]` → si l'IA omet/dégénère `photo_index`, toutes les slides retombent silencieusement sur `photos[0]`.
- `supabase/functions/carousel-visual/index.ts` consomme `photo_index` via placeholders `{{PHOTO_N}}` → bénéficie automatiquement de la normalisation faite côté `carousel-ai` (rien à modifier ici si la normalisation est appliquée avant que `content` ne soit persisté).

## (a) Demandé — Changements

### 1. `supabase/functions/carousel-ai/index.ts`
Créer une fonction helper locale `normalizePhotoIndexes(content: string, photoCount: number): string` :
- Tente d'extraire le JSON du `content` (regex `/\{[\s\S]*\}/`).
- Si parse échoue ou pas de `slides[]` → renvoie `content` inchangé (no-op safe).
- Si `photoCount <= 0` → renvoie `content` inchangé.
- Identifie les slides "porteuses de photo" : `slide_type === "photo_full" || slide_type === "photo_integrated"`.
- Vérifie la validité de l'assignation IA :
  - valide ssi chaque slide-photo a un `photo_index` entier dans `[1, photoCount]`, ET
  - **pas dégénéré** : si `photoCount > 1` et qu'il y a plus de slides-photo qu'il n'y a de valeurs distinctes utilisées ET qu'une seule valeur couvre toutes les slides-photo → dégénéré.
- Si non-valide OU dégénéré → réassigner séquentiellement : i-ème slide-photo (0-based) → `photo_index = min(i + 1, photoCount)` (clamp = réutilise la dernière).
- Les slides `text_only` ou sans `slide_type` portant photo : forcer `photo_index = null`.
- Re-stringify le JSON et le remettre dans `content` (préserver le texte autour du JSON s'il y en a — remplacer la sous-chaîne match).
- Try/catch global : sur erreur, renvoyer `content` original + `console.warn`.

Appeler ce helper :
- l.~310 (mode photo) : `content = normalizePhotoIndexes(content, body.photos?.length || 0);` juste avant `logUsage` / `return`.
- l.~242 (mode mix) : idem.

### 2. `src/lib/export-carousel-pptx.ts`
Durcir le fallback aux lignes 259-260 et 373-374. Remplacer :
```ts
const photoIdx = (s.photo_index || 1) - 1;
const photo = photos[photoIdx] || photos[0];
```
par :
```ts
const requested = (s.photo_index || 1) - 1;
const clamped = Math.max(0, Math.min(requested, photos.length - 1));
const photo = photos[clamped];
if (requested !== clamped) {
  console.warn(`[export-pptx] photo_index ${s.photo_index} hors plage (${photos.length} photos) → clamp à ${clamped + 1}`);
}
```
Pas de retombée muette sur `photos[0]`. Si `photos.length === 0`, `clamped` reste 0, `photo` est `undefined`, le code aval garde son `if (photo)` existant.

### 3. `supabase/functions/carousel-visual/index.ts`
**Aucune modification.** Les placeholders `{{PHOTO_N}}` lisent le `photo_index` déjà normalisé par carousel-ai côté upstream du pipeline visuel.

## (b) Suggestions optionnelles (à valider individuellement)

1. **Log de télémétrie côté carousel-ai** : `console.log("[carousel-ai] photo_index normalisé : IA=%o → final=%o", aiAssignment, normalized)` quand on corrige. Aide à mesurer la fréquence du bug IA dans les logs Edge.
2. **Test unitaire** sur `normalizePhotoIndexes` (cas : valide / omis / hors plage / dégénéré tous-à-1 / moins de photos que de slides-photo). Fichier : `supabase/functions/carousel-ai/normalize-photo-index_test.ts` — nécessiterait d'exporter le helper.
3. **Helper partagé** : déplacer `normalizePhotoIndexes` dans `supabase/functions/_shared/` pour qu'il serve aussi à `carousel-visual` en défense en profondeur (au cas où un ancien `content` non normalisé serait rejoué). Petit refacto.

## Hors scope (rappel)
- Réordonnancement manuel UI.
- Bouton "nouvelle proposition".
- Quota / workspace / contenu textuel des slides / mode text-only.

## Validation
- `npx tsc --noEmit --skipLibCheck` → 0 erreur.
- Carrousel 5 photos → 5 photos distinctes à l'export.
- Carrousel mix 3 photos + 2 slides texte → mapping 1/2/3 sur les slides-photo, `null` sur les slides texte.
- Carrousel 5 slides-photo mais 3 photos uploadées → mapping 1/2/3/3/3 (clamp), pas d'erreur.
