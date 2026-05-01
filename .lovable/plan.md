## Étape 1 — `extractPhotoZones` + CSS masquage

**Scope strict** : ajouter le code de détection et le CSS de masquage sans l'appeler. Aucun changement du comportement runtime.

### Fichier modifié
`src/lib/export-carousel-hybrid-pptx.ts`

### Modifications

**1. Ajouter dans le CSS de l'iframe (`mountIframe`, après le bloc `[data-pptx-hide]`)**

```css
/* Masquage des zones photo : visibility (pas display) pour préserver le layout
   et garder getBoundingClientRect valide. Le background-image est traité
   en JS pour conserver les gradients overlay (cf. extractPhotoZones). */
[data-pptx-photo-hide="true"] img,
[data-pptx-photo-hide="true"] picture,
[data-pptx-photo-hide="true"] svg image {
  visibility: hidden !important;
}
```

**2. Ajouter les types exportés (en haut du fichier, après les interfaces existantes)**

```ts
export interface OriginalPhoto {
  base64: string;
  mimeType?: string;
}

interface PhotoZone {
  el: HTMLElement;
  photoIndex: number; // 1-indexé
  rect: { x: number; y: number; w: number; h: number };
  type: "img" | "background";
}
```

**3. Ajouter la fonction `extractPhotoZones` (avant `addBlockToSlide`)**

```ts
/**
 * Détecte les zones photo dans le HTML d'une slide.
 *
 * Strategy A (priorité) : éléments annotés [data-pptx-photo="N"] par Sonnet.
 * Strategy B (fallback) : détection défensive sur <img src="data:image/..."> et
 *   éléments avec background-image: url(data:image/...). photoIndex = ordre
 *   d'apparition (1-indexé).
 *
 * Ne masque PAS les éléments — c'est à l'appelant de gérer le cycle
 * masquage / capture / unmask en fonction de la disponibilité des
 * originalPhotos correspondants.
 */
function extractPhotoZones(doc: Document): PhotoZone[] {
  const win = doc.defaultView;
  if (!win) return [];

  const zones: PhotoZone[] = [];
  const seen = new Set<HTMLElement>();

  const pushZone = (el: HTMLElement, photoIndex: number, type: "img" | "background") => {
    if (seen.has(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    if (r.y > SLIDE_H_PX || r.x > SLIDE_W_PX) return;
    if (r.y + r.height < 0 || r.x + r.width < 0) return;
    seen.add(el);
    zones.push({
      el,
      photoIndex,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      type,
    });
  };

  // Strategy A — annotations explicites Sonnet
  const annotated = Array.from(doc.querySelectorAll<HTMLElement>("[data-pptx-photo]"));
  if (annotated.length > 0) {
    // Garde-fou P3 : warn si même photoIndex apparaît 2× sur la même slide
    const indexCounts = new Map<number, number>();
    for (const el of annotated) {
      const raw = el.getAttribute("data-pptx-photo");
      const idx = raw ? parseInt(raw, 10) : NaN;
      if (!Number.isInteger(idx) || idx < 1) {
        console.warn(`[hybrid] data-pptx-photo invalide: "${raw}", ignoré`);
        continue;
      }
      indexCounts.set(idx, (indexCounts.get(idx) || 0) + 1);
      const isImg = el.tagName === "IMG";
      pushZone(el, idx, isImg ? "img" : "background");
    }
    for (const [idx, count] of indexCounts) {
      if (count > 1) {
        console.warn(`[hybrid] photoIndex ${idx} annoté ${count} fois sur la même slide — la photo sera insérée plusieurs fois`);
      }
    }
    return zones;
  }

  // Strategy B (fallback) — détection défensive
  let autoIndex = 1;

  // <img> base64
  const imgs = Array.from(doc.querySelectorAll<HTMLImageElement>("img"));
  for (const img of imgs) {
    const src = img.getAttribute("src") || "";
    if (!src.startsWith("data:image/")) continue;
    pushZone(img, autoIndex++, "img");
  }

  // background-image: url(data:image/...)
  const all = Array.from(doc.body.querySelectorAll<HTMLElement>("*"));
  for (const el of all) {
    if (seen.has(el)) continue;
    const cs = win.getComputedStyle(el);
    const bg = cs.backgroundImage || "";
    if (!/url\(["']?data:image\//i.test(bg)) continue;
    pushZone(el, autoIndex++, "background");
  }

  return zones;
}
```

### Ce qui NE bouge PAS

- Aucun appel à `extractPhotoZones` dans la boucle slide → comportement export inchangé.
- Toutes les fonctions existantes (`mountIframe`, `captureBody`, `extractAnnotatedBlocks`, `addBlockToSlide`) intactes hormis l'ajout CSS.
- Signature `exportCarouselHybridPptx` inchangée (Étape 2).
- `CreerUnifie.tsx`, prompt Sonnet : non touchés (Étape 3).

### Validation

- `tsc --noEmit` (lancé par le harness) — doit passer.
- L'export PPTX hybride doit produire un fichier strictement identique à avant cette étape (le code ajouté est dormant).

### Hors scope (Étapes 2 & 3)

- Inversion ordre Z dans la boucle slide
- Insertion native `slide.addImage` des photos
- Gestion gradients (`backgroundImage` filtré)
- Câblage `originalPhotos` depuis `CreerUnifie.tsx`
- `trackWarning` Sentry (P4) — sera intégré en Étape 2 dans la boucle qui consomme les zones
- Annotation `data-pptx-photo` côté prompt Sonnet