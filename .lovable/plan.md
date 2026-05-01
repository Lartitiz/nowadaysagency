# Étape 2 — Boucle slide hybride : photos natives + fond rasterisé transparent

## Confirmation

État repo vérifié :
- ✅ Étape 1 OK : `OriginalPhoto`, `PhotoZone`, `extractPhotoZones` (Strategy A + B + garde-fou P3), CSS `data-pptx-photo-hide`
- ❌ Étape 2 absente : signature à 4 paramètres, pas d'inversion d'ordre Z
- ❌ Étape 3 absente (hors scope ici)

Étape 2 ne touche QUE `src/lib/export-carousel-hybrid-pptx.ts`. Pas de câblage CreerUnifie, pas de prompt Sonnet (Étape 3).

## Changements

### 1. Imports

Ajouter en tête de fichier :
```ts
import * as Sentry from "@sentry/react";
```

### 2. Signature de `exportCarouselHybridPptx`

Ajouter 5e paramètre optionnel :
```ts
export async function exportCarouselHybridPptx(
  visualSlides: VisualSlide[],
  slidesData: SlideData[] | null | undefined,
  charter: HybridCharter | null | undefined,
  fileName = "carrousel-editable",
  originalPhotos?: OriginalPhoto[],
)
```

Rétro-compat garantie : `CalendarPostPreview.tsx` ligne 116 appelle avec 4 args → `originalPhotos = undefined` → fallback total (comportement actuel inchangé).

### 3. Boucle slide — nouvelle séquence

Dans le `try` (lignes 399-457), réorganiser ainsi :

```text
1. waitReady(iframe)
2. extractAnnotatedBlocks → blocks[] + setAttribute data-pptx-hide  ┐
3. (idem strategies B/C texte)                                      │  inchangé
                                                                    ┘
4. NOUVEAU : extractPhotoZones(doc) → allZones
   filter usableZones = zones où originalPhotos?.[zone.photoIndex - 1]?.base64 existe
   pour zones NON usables : Sentry.captureMessage P4 + (laisser visible : pas de masquage)
   pour zones usables :
     - type "img" : zone.el.parentElement.setAttribute("data-pptx-photo-hide", "true")
                   (le CSS Étape 1 cible "[data-pptx-photo-hide=true] img" → masque l'IMG via visibility:hidden)
                   Si pas de parent (cas tordu) : annoter l'élément lui-même
     - type "background" : reconstruire backgroundImage inline en retirant
                           UNIQUEMENT les "url(data:image/...)" et conservant
                           gradients (linear-gradient, radial-gradient,
                           conic-gradient). Implémentation : split sur virgules
                           top-level (pas dans parenthèses) puis filter.

5. Force layout flush : void doc.body.offsetHeight + await setTimeout(30ms)
   (déjà présent à 50ms après les blocs texte → on garde, pas de duplication)

6. captureBody(doc) → bg PNG transparent sur les zones photo
   (backgroundColor:null déjà set + visibility:hidden = transparence)

7. NOUVEAU : INVERSION ORDRE Z — couche bottom = photos natives
   Pour chaque zone usable, AVANT addImage(bg) :
     const photo = originalPhotos[zone.photoIndex - 1];
     slide.addImage({
       data: photo.base64,            // déjà préfixé "data:image/..." par convention upstream
       x: pxToInches(zone.rect.x, PX_PER_IN),
       y: pxToInches(zone.rect.y, PX_PER_IN),
       w: pxToInches(zone.rect.w, PX_PER_IN),
       h: pxToInches(zone.rect.h, PX_PER_IN),
       sizing: { type: "cover", w: ..., h: ... },  // cover dans la zone
     });

8. addImage(bg) — fond rasterisé par-dessus les photos (zones photo transparentes)

9. addText des blocks (couche top, inchangée)
```

### 4. Helper privé `stripDataUrlsFromBackground`

Petit utilitaire local, testable mentalement :

```ts
function stripDataUrlsFromBackground(bgImage: string): string {
  // Split sur virgules top-level uniquement (pas dans parenthèses)
  const parts: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < bgImage.length; i++) {
    const c = bgImage[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      parts.push(bgImage.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(bgImage.slice(start).trim());
  // Garder ce qui n'est PAS un url(data:image/...)
  const kept = parts.filter((p) => !/^url\(["']?data:image\//i.test(p));
  return kept.length > 0 ? kept.join(", ") : "none";
}
```

### 5. Fallback Sentry P4

```ts
for (const zone of allZones) {
  const photo = originalPhotos?.[zone.photoIndex - 1];
  if (!photo?.base64) {
    Sentry.captureMessage("[hybrid] photo native introuvable", {
      level: "warning",
      extra: { photoIndex: zone.photoIndex, slideNumber: vs.slide_number },
    });
    continue; // zone non usable : on laisse visible dans le rasterisé
  }
  usableZones.push(zone);
}
```

## Architecture finale (pseudo-code)

```text
for each slide:
  mountIframe + waitReady
  blocks ← extract texte (inchangé)
  cacher blocks texte (inchangé)

  zones ← extractPhotoZones
  usable ← zones filtrées sur originalPhotos disponibles
  Sentry.warning sur chaque zone non usable
  pour chaque usable : masquer img / nettoyer backgroundImage
  flush layout

  bg ← captureBody (transparent sur zones)

  // ORDRE Z (de bottom à top) :
  pour chaque usable : slide.addImage(originalPhoto)   ← couche 1
  slide.addImage(bg, full slide)                        ← couche 2
  pour chaque block : slide.addText                     ← couche 3
```

## Critères de validation

1. **Compile clean** : `bunx tsc --noEmit` sans erreur.
2. **Régression text_only** : un carrousel texte appelé avec `originalPhotos = undefined` (4 args via CalendarPostPreview) doit produire exactement le même PPTX qu'avant.
3. **Carrousel avec photos + originalPhotos undefined** : pas de crash, fallback total = comportement actuel (photos rasterisées dans le fond).
4. **Carrousel avec photos + originalPhotos fourni** : photos natives en couche bottom, fond transparent dessus, texte éditable au-dessus.

Pas de test runtime exécuté ici (pas de fixtures sous la main) — la validation visuelle se fera lors de l'Étape 3 quand le câblage CreerUnifie sera en place.

## Hors-scope (Étape 3)

- Câblage `originalPhotos = generatedWithPhotos` dans `CreerUnifie.tsx` ligne 2143.
- Instruction Sonnet pour `data-pptx-photo="N"` dans `supabase/functions/carousel-visual/index.ts`.
- Test E2E de bout en bout.

## Risques résiduels

- **`photo.base64` format** : on suppose que la string contient déjà le préfixe `data:image/...` (convention upstream PhotoUploadZone). Si ce n'est pas le cas, addImage de pptxgenjs échouera silencieusement. À documenter dans le JSDoc de `OriginalPhoto`.
- **Élément `img` sans parent direct dans body** : très rare, fallback géré (annoter l'IMG lui-même au lieu du parent).
- **Zone qui dépasse la slide** : `extractPhotoZones` filtre déjà les zones hors-slide, mais `pxToInches` peut produire des x/y négatifs si la zone est partiellement sortie. À clamper avec `Math.max(0, ...)` pour x/y et `Math.min(PPTX_W_IN - x, ...)` pour w/h.
