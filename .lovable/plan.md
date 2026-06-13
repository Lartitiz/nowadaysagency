## Problème

Dans `SocialMockup` (rendu Instagram), un post multi-photos sans `slides` textuels n'affiche que la première image (`<img mediaUrls[0]>`). Les flèches/dots du slider sont absents.

## Solution (a — demandé)

### Fichier 1 — `src/components/social-mockup/CarouselSlider.tsx`

Rendre le slider tolérant à un `slides` vide quand `mediaUrls` est fourni.

- Calculer le nombre total de pages : `const total = Math.max(slides?.length || 0, mediaUrls?.length || 0);`
- Remplacer `slides.length` par `total` dans :
  - le clamp de `next()` (`Math.min(total - 1, i + 1)`)
  - le compteur `{current + 1}/{total}`
  - la condition d'affichage de la flèche droite (`current < total - 1`)
  - la boucle des dots (`Array.from({ length: total }).map(...)`)
- Le bloc texte de fallback (`slide?.title` / `slide?.body`) ne s'affiche déjà que si `mediaUrls[current]` est absent → comportement conservé.
- Rendre `slides` optionnel dans l'interface (`slides?: Slide[]`) pour le cas photos-pures.

### Fichier 2 — `src/components/social-mockup/SocialMockup.tsx` (ligne ~86-95)

Étendre la branche `format === "carousel"` à `mediaUrls.length > 1`, sans toucher au cas mono-photo :

```tsx
{(format === "carousel" && slides && slides.length > 0) || (mediaUrls && mediaUrls.length > 1) ? (
  compact ? (
    <div className="w-full aspect-[4/3] flex items-center justify-center" style={{...}}>
      <span className="text-2xl">{FORMAT_EMOJI.carousel}</span>
    </div>
  ) : (
    <CarouselSlider slides={slides || []} mediaUrls={mediaUrls} />
  )
) : mediaUrls && mediaUrls.length > 0 ? (
  <img src={mediaUrls[0]} ... />
) : (
  /* placeholder inchangé */
)}
```

→ Multi-photos (≥2) déclenche le slider ; mono-photo reste un `<img>` simple ; carrousel texte classique inchangé ; placeholder inchangé.

## Ce qui ne bouge pas

- LinkedInMockup / LinkedInMedia (intact).
- CalendarPostPreview, CalendarPostDialog, CreerUnifie (intacts).
- Mode `compact` (vignette calendrier) : conserve l'emoji carrousel.
- Props existantes (aucune supprimée, `slides` devient juste optionnel).

## Validation

- `npx tsc --noEmit --skipLibCheck` passe.
- Test manuel : post 2 photos via "Partir de photos" → calendrier → preview affiche flèches + dots.
- Carrousel texte classique : inchangé.
- Mono-photo : reste `<img>` simple.

## Proposition (b)

**Proposition n°1** — Plutôt qu'une détection implicite via `mediaUrls.length > 1`, ajouter un prop explicite `photoCarousel?: boolean` calculé en amont (ex: dans `CalendarPostPreview`). Avantage : intention claire, pas de "magie" sur la longueur. Inconvénient : touche un fichier hors scope. **Recommandation : ne PAS appliquer**, la détection par longueur est suffisante et reste locale à `SocialMockup`.

**Proposition n°2** — Activer le slider dès `mediaUrls.length >= 1` (même mono-photo) pour homogénéiser le rendu. Inconvénient : ajoute compteur "1/1" et dots inutiles. **Recommandation : ne PAS appliquer**, garder le `<img>` pur en mono-photo.

## Hors scope

- ContentViewer plein écran.
- Export PPTX/PNG des photos pures.
- Mode mix (photo + texte).