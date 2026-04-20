

## Plan — Fix photos perdues + Slide 1 sans hook

### Diagnostic confirmé
- `handleGenerateVisuals` lit `uploadedPhotos` du state React, mais ce state a été remis à `[]` quelque part entre la génération du carrousel et le clic sur "Générer les visuels".
- Conséquence : `effectiveCarouselType` retombe sur `"text"` → la slide 1 forcée en `photo_full` (logique branchée sur `isMixCarousel`) ne se déclenche pas → pas de hook visuel.

### Périmètre — 1 fichier
`src/pages/CreerUnifie.tsx`

### Action 1 — Persister les photos dans le résultat (source de vérité)
Au moment où le carrousel mix/photo est généré (autour de `doGenerate` / `handleConfirmStructure`), stocker les `uploadedPhotos` dans `result.raw.uploadedPhotos` (ou un nouveau state dédié `generatedWithPhotos`). Ainsi la génération des visuels ne dépend plus du state UI qui peut être reset.

Dans `handleGenerateVisuals`, lire en priorité depuis cette source persistée :
```ts
const photosForVisuals = result?.raw?.uploadedPhotos ?? uploadedPhotos;
```
Et utiliser `photosForVisuals` partout dans cette fonction (calcul de `effectiveCarouselType`, payload `photos`, calcul slide 1 hook, etc.).

### Action 3 — Investigation des resets
Ajouter des logs ciblés sur **chaque** `setUploadedPhotos([])` (lignes ~452 et ~1127 + tout autre endroit) :
```ts
console.log("[uploadedPhotos] RESET from:", new Error().stack?.split("\n")[2]);
```
→ permet d'identifier au prochain run l'origine exacte du reset (changement d'onglet ? confirmation structure ? autre handler ?).

Si le reset est identifié comme inutile/buggué dans la foulée, le supprimer ; sinon laisser la persistance (Action 1) faire le job de filet de sécurité.

### Validation
1. `tsc --noEmit --skipLibCheck` → 0 erreur
2. Reproduction du bug : upload photos → génère carrousel mix → "Générer les visuels" → vérifier dans le payload `carousel-visual` que `has_photos: true` et que slide 1 est bien `photo_full`.
3. Vérifier les logs du reset pour comprendre la racine.

### Hors scope
- Action 2 (toast garde-fou) : volontairement écartée selon ta décision.
- Bibliothèque média / persistance long terme.

