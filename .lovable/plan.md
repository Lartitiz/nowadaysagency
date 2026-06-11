## Fix — Rect des textes PPTX en content-box

### Contexte
Dans l'export PPTX hybride, `extractAnnotatedBlocks` et `extractEditableBlocks` utilisent `getBoundingClientRect()` qui retourne le border-box (padding inclus). Résultat : le texte des badges/pilules se retrouve plaqué dans le coin arrondi. Le fix consiste à utiliser le content-box (border-box moins le padding) pour les frames texte uniquement — les shapes restent en border-box.

### Changements
**Fichier : `src/lib/pptx-font-mapping.ts`**

1. **Ajouter `contentBoxRect`** — fonction helper non exportée qui calcule `x = r.left + paddingLeft`, `y = r.top + paddingTop`, `w = r.width - paddingLeft - paddingRight`, `h = r.height - paddingTop - paddingBottom`, avec un minimum de 1 px.

2. **`extractAnnotatedBlocks`** (l. 297-348) :
   - Conserver le `getBoundingClientRect()` brut pour le check `r.width < 5 || r.height < 5` (filtrage d'élément).
   - Remplacer le `rect` poussé dans `EditableBlock` par `contentBoxRect(el, cs)`.

3. **`extractEditableBlocks`** (l. 218-291) :
   - Conserver le `getBoundingClientRect()` brut pour le check `r.width < 20 || r.height < 10` (filtrage d'élément).
   - Remplacer le `rect` poussé dans `candidates` par `contentBoxRect(el, cs)`.

### Hors scope (ne pas toucher)
- `extractShapeBlocks` : les shapes restent en border-box (géométrie visuelle complète).
- `mapFontToPptx`, `extractRunsFromElement`, `getOverlayCoords`, `normalizeHex`, etc.
- `src/lib/export-carousel-hybrid-pptx.ts` et autres fichiers d'export.

### Validation
- `npx tsc --noEmit --skipLibCheck` passe.
- Test manuel : le compteur "0X / 08" est centré dans sa pilule, les blocs sans padding restent inchangés.