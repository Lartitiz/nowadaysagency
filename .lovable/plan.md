## Objectif
Persister les photos uploadées (`savePhotos`) de façon précoce et indépendante de `carouselSubMode`, pour que `loadPhotos()` soit fiable lors des remounts qui peuvent survenir pendant la génération. Aujourd'hui le save n'arrive que via le useEffect (l. 543-550) conditionné à `carouselSubMode` ∈ {photo, mix, pure_photo} ; tant que le sous-mode n'est pas encore commité, ou si la batch de setState n'a pas flushé, `loadPhotos()` reste vide → `safeStep` (l. 142-144) retombe sur `"format"` et la fenêtre UI perd les photos.

## Fichier impacté
- `src/pages/CreerUnifie.tsx` (uniquement)

## Changements

### 1. Save synchrone aux points d'entrée des photos
Ajouter un `savePhotos(<photos>)` juste après chaque `setUploadedPhotos(<photos non vides>)` réel :

- **L. 515** (chargement depuis la photothèque) — après `setUploadedPhotos(items);` :
  `if (items.length > 0) savePhotos(items);`
- **L. 627** (`handlePhotosNext`) — après `setUploadedPhotos(photos);` :
  `if (photos.length > 0) savePhotos(photos);`
- **L. 654** (`handleFormatNext`, branche demo) — wrapper le `if (photos) setUploadedPhotos(photos);` en :
  ```ts
  if (photos) {
    setUploadedPhotos(photos);
    if (photos.length > 0) savePhotos(photos);
  }
  ```
- **L. 672** (`handleFormatNext`, branche normale) — même wrapper.

Ces appels sont synchrones, ne dépendent pas de `carouselSubMode`, et persistent dès que des photos arrivent — exactement ce qui rend `loadPhotos()` fiable au remount.

### 2. Renforcer le useEffect (l. 543-550)
Retirer la condition `carouselSubMode === ...` pour le `savePhotos` ; garder le snapshot `setGeneratedWithPhotos`. Nouvelle forme :

```ts
useEffect(() => {
  if (uploadedPhotos.length > 0) {
    setGeneratedWithPhotos((prev) => (prev.length === uploadedPhotos.length ? prev : uploadedPhotos));
    if (selectedFormat === "carousel" || photoMode) {
      savePhotos(uploadedPhotos);
    }
  }
}, [uploadedPhotos, selectedFormat, photoMode]);
```

Filet de sécurité : persiste toute mise à jour ultérieure (édition d'un contexte photo, ajout, etc.) en contexte carrousel ou photoMode, sans attendre que `carouselSubMode` soit commité.

### 3. NE PAS toucher
- `safeStep` (l. 136-152) — devient fiable une fois `loadPhotos()` correct.
- `use-flow-persistence.ts` — pas de changement.
- Logique de génération, mapping, `PhotoMissingDialog`, `generatedWithPhotos`.
- `clearFlowState` / `clearPhotos` légitimes (reset, fresh start, l. 1497, save calendrier réussi).
- Le fix Bug B (`persistCarousel`) — indépendant.

## Validation
1. `npx tsc --noEmit --skipLibCheck` → 0 erreur.
2. Manuel — carrousel photo : uploader 3 photos → générer structure puis slides → le flow reste en `"photo"`, les 3 photos sont conservées, aucun retour à `"format"`.
3. Régression — carrousel texte : pas d'effet de bord, pas de save inutile (la garde `uploadedPhotos.length > 0` protège).
4. Régression — après "Ajouter à l'agenda" réussi : `clearFlowState`/`clearPhotos` nettoient bien, pas de fuite cross-session.

## Signalement (proposition, non implémenté)
En dernier recours, `uploadedPhotos` pourrait être restauré depuis `generatedWithPhotos` si `loadPhotos()` est vide ET que la génération a déjà eu lieu — c'est une rustine secondaire. Le vrai fix est celui ci-dessus (persister tôt). À garder en tête seulement si un edge case résiduel apparaît.

## Hors scope
- Persistance des photos dans `SaveToIdeasDialog` (plan séparé).