## Objectif

Insérer chaque photo dans le PPTX avec un VRAI crop "cover" centré (recadrage proportionnel) au lieu de l'actuel stretch. Mesure des dimensions source faite localement dans l'exporteur, sans toucher à la chaîne amont ni à l'interface `OriginalPhoto`.

## Cause racine (rappel)

`slide.addImage({ w, h, sizing: { type: "cover", w, h } })` passe les dimensions du CADRE à `sizing.cover`. Sans le ratio source réel, pptxgenjs ne peut pas calculer le crop → il étire l'image pour remplir.

## Fichier impacté

`src/lib/export-carousel-hybrid-pptx.ts` UNIQUEMENT.

## Solution (a) — Demandé

### 1. Helper de mesure des dimensions source

Ajouter en haut du fichier (au-dessus de `exportCarouselHybridPptx`) :

```ts
async function measureImageSize(
  dataUrl: string,
  timeoutMs = 5000,
): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const t = setTimeout(() => { img.src = ""; resolve(null); }, timeoutMs);
    img.onload = () => {
      clearTimeout(t);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = dataUrl;
  });
}
```

### 2. Pré-mesure mutualisée (une fois par photo, pas par slide)

Juste après `const logoBase64 = await fetchLogoAsBase64(logoUrl);` (ligne 461) :

```ts
const photoSizes: Array<{ w: number; h: number } | null> =
  originalPhotos
    ? await Promise.all(originalPhotos.map((p) => measureImageSize(p.base64)))
    : [];
```

Une photo réutilisée sur plusieurs slides n'est mesurée qu'une fois.

### 3. Calcul du crop centré au moment de l'insertion

Remplacer le bloc `slide.addImage({ ..., sizing: { type: "cover", w, h } })` (lignes 609-621) par un calcul qui produit `sizing.type: "crop"` avec une fenêtre source proportionnelle au ratio du cadre :

```ts
const srcSize = photoSizes[zone.photoIndex - 1];
const addImageOpts: any = { data: photo.base64, x, y, w, h };

if (srcSize && srcSize.w > 0 && srcSize.h > 0) {
  const srcRatio   = srcSize.w / srcSize.h;
  const frameRatio = w / h;
  const TOL = 0.01;

  // Crop exprimé en POURCENTAGES de l'image source (invariant à la résolution).
  // pptxgenjs (type: "crop") accepte des Coord en "NN%".
  const pct = (v: number) => `${(v * 100).toFixed(4)}%`;

  if (Math.abs(srcRatio - frameRatio) < TOL) {
    // Ratios alignés → pas de sizing → l'image remplit le cadre sans déformation.
  } else if (srcRatio > frameRatio) {
    // Source plus paysage que le cadre → rogner gauche/droite, garder toute la hauteur.
    const visibleFrac = frameRatio / srcRatio; // part de la largeur source conservée (0-1)
    const offFrac = (1 - visibleFrac) / 2;     // marge rognée de chaque côté
    addImageOpts.sizing = {
      type: "crop",
      x: pct(offFrac),
      y: "0%",
      w: pct(visibleFrac),
      h: "100%",
    };
  } else {
    // Source plus portrait que le cadre → rogner haut/bas, garder toute la largeur.
    const visibleFrac = srcRatio / frameRatio; // part de la hauteur source conservée (0-1)
    const offFrac = (1 - visibleFrac) / 2;
    addImageOpts.sizing = {
      type: "crop",
      x: "0%",
      y: pct(offFrac),
      w: "100%",
      h: pct(visibleFrac),
    };
  }
} else {
  // Fallback : mesure échouée → comportement actuel (peut étirer, pas de crash).
  addImageOpts.sizing = { type: "cover", w, h };
}

try {
  slide.addImage(addImageOpts);
} catch (e) {
  console.warn("[hybrid] addImage(originalPhoto) failed", e);
}
```

Note technique : avec `sizing.type: "crop"`, pptxgenjs interprète `x/y/w/h` du sizing comme une fenêtre dans le repère source (en inches via `PX_PER_IN` pour rester cohérent), et le cadre cible reste défini par les `x/y/w/h` du `addImage`. Comme `visibleW / visibleH === frameRatio` par construction, il n'y a aucune déformation.

## Ce qui NE BOUGE PAS (confirmé)

- Architecture 3 couches (photos → shapes natifs → PNG → texte).
- Placement et coordonnées des cadres photo (x, y, w, h) : INCHANGÉS.
- Clamping existant `Math.max/Math.min` sur x, y, w, h (lignes 604-607).
- Constantes `SLIDE_W_PX`, `SLIDE_H_PX`, `PPTX_W_IN`, `PPTX_H_IN`, `PX_PER_IN`.
- Logo, fond PNG, shapes natifs, texte éditable, captureBody, mountIframe.
- Interface `OriginalPhoto` : INCHANGÉE (mesure locale, pas de nouveau champ amont).
- Pattern quota, palette, fonts.
- `CreerUnifie.tsx`, hooks, Edge Functions : INCHANGÉS.

## Validation

1. `npx tsc --noEmit --skipLibCheck` : 0 erreur.
2. Régénérer un carrousel contenant au moins :
  - 1 slide photo-haut/texte-bas avec photo PORTRAIT (cas du bug)
  - 1 slide photo plein cadre (ratio proche du cadre)
  - 1 slide `photo_integrated` colonne verticale
3. Ouvrir le PPTX : aucune photo aplatie, sujet correctement proportionné, recadrage centré cohérent.
4. Photo déjà bien proportionnée → rendu identique à avant (branche TOL atteinte).
5. Slides sans photo : aucune régression.

## Propositions séparées (b) — à valider individuellement

- **b1. Point focal configurable.** Aujourd'hui on centre. Lire un `data-pptx-focal-x` / `data-pptx-focal-y` (0-1) sur l'élément photo HTML pour décaler le crop (utile portraits où le visage est haut). 5 lignes. À activer seulement quand la couche amont annote l'info.
- **b2. Mutualisation amont du sizing.** Si une étape pipeline charge déjà ces base64 dans un `Image()`, on pourrait y cacher `naturalWidth/Height`. Bénéfice marginal (mesure base64 = quelques ms), risque de couplage. **Recommandation : ne pas faire**, garder mesure locale autonome.
- **b3. Tolérance.** `TOL = 0.01` (1%) évite des crops invisibles. Ajuster à `0.005` seulement si on observe du micro-aliasing aux bords, après QA visuelle.

## Hors scope (rappel)

- Éditabilité texte cartes en PPTX (plan distinct).
- `supabase/functions/carousel-visual/index.ts` (plan A layout — déjà traité).
- Micro-cadrage fond logo, export PNG.