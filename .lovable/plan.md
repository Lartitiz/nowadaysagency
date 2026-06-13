## Objectif

Remplacer l'approche `sizing: { type: "crop", ... }` (qui produit des `srcRect` invalides avec valeurs négatives dans pptxgenjs v4) par un pré-recadrage centré "cover" via `<canvas>` AVANT insertion. L'image arrivera déjà au ratio exact du cadre → aucun `srcRect`, aucune déformation.

## Fichier impacté

- `src/lib/export-carousel-hybrid-pptx.ts` (uniquement)

## Changements

### 1. Remplacer `measureImageSize` par `cropToRatioBase64` (lignes 64-82)

Helper qui charge la dataURL dans un `Image`, calcule la fenêtre source "cover" centrée pour `targetRatio`, dessine dans un canvas à la résolution conservée (pas de perte), retourne `canvas.toDataURL("image/jpeg", 0.92)` ou `null` en cas d'échec/timeout (5s).

### 2. Supprimer le pré-calcul `photoSizes` (lignes 483-487)

Plus nécessaire — le crop est désormais fait à l'insertion, par cadre. Remplacer par un cache :

```ts
const cropCache = new Map<string, string | null>();
// clé: `${photoIndex}:${frameRatio.toFixed(3)}`
```

Le cache mutualise les recadrages quand la même photo réapparaît avec un cadre de ratio identique.

### 3. Remplacer le bloc `addImage` lignes 635-679

```ts
const frameRatio = w / h;
const cacheKey = `${zone.photoIndex}:${frameRatio.toFixed(3)}`;
let cropped = cropCache.get(cacheKey);
if (cropped === undefined) {
  cropped = await cropToRatioBase64(photo.base64, frameRatio);
  cropCache.set(cacheKey, cropped);
}
try {
  slide.addImage({
    data: cropped ?? photo.base64,
    x, y, w, h,
    ...(cropped ? {} : { sizing: { type: "cover", w, h } }),
  });
} catch (e) {
  console.warn("[hybrid] addImage(originalPhoto) failed", e);
}
```

La boucle est déjà dans `exportCarouselHybridPptx` (async) → `await` est valide. Confirmé : la boucle ligne 623 est dans le `for (let i…)` qui est lui-même dans une fonction `async`.

## Ce qui NE BOUGE PAS

- Architecture 3 couches (photos → shapes natifs → PNG → texte)
- Coordonnées des cadres (x, y, w, h) et clamping
- Constantes SLIDE_W_PX/H_PX, PPTX_W/H_IN, PX_PER_IN
- Logo, fond PNG, shapes natifs, texte éditable, `captureBody`
- Interface `OriginalPhoto`
- Chaîne amont (CreerUnifie, hooks, Edge Function)

## Validation

1. `npx tsc --noEmit --skipLibCheck` : 0 erreur
2. Régénérer un carrousel avec slide photo-haut (photo portrait), slide photo plein cadre, slide photo colonne verticale → photos non déformées, recadrage centré, nettes
3. XML d'une slide photo : `<p:pic>` sans `<a:srcRect>` (ou neutre `l=0 r=0 t=0 b=0`), aucune valeur négative
4. Slides sans photo : aucune régression

## Propositions séparées (b)

- **b1. Point focal personnalisé** : lire `data-pptx-focal-x/y` (0-1) sur l'élément photo et l'utiliser pour décaler `ox/oy` au lieu du centrage. Utile pour portraits visage haut. Hors scope ici. o
- **b2. Qualité JPEG** : 0.92 = bon compromis. Passer à 0.95 si tu veux plus de netteté (poids ↑).

## Hors scope

- Éditabilité texte cartes en PPTX
- `carousel-visual/index.ts` (layout)
- Micro-cadrage logo, export PNG