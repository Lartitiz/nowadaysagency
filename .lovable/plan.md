# Plan — Carrousel "Photos brutes" : 1 photo = 1 slide + légende dédiée

## Problème

En mode `pure_photo` avec 2 photos uploadées, le résultat est un carrousel de 8 slides avec les 2 photos dupliquées en boucle. Le flow passe par `carousel-ai` (questions + structure 8 slides) puis "strippe" les overlays côté client — mais le nombre de slides reste celui imposé par l'IA, pas celui des photos.

Or `pure_photo` n'a pas besoin de structure narrative : c'est juste **N photos brutes + une légende qui les accompagne**.

## Comportement cible

Pour `carouselSubMode === "pure_photo"` :

1. **Bypass complet** des étapes "questions" et "structure_review" — rien à structurer. Alors, si, il faut bien poser des questions pour créer le texte derrière. 
2. **Nombre de slides = nombre de photos uploadées** (2 photos → 2 slides, 5 → 5), dans l'ordre.
3. Chaque slide = `slide_type: "photo_full"`, `photo_index: i+1`, aucun overlay/title/body.
4. **Génération IA limitée à la légende** (Instagram ou LinkedIn selon le canal) : hook + corps + CTA + hashtags, basée sur sujet / objectif / angle / `photoDescription` / contextes par photo (`photos[i].context`).
5. Rendu et export PPTX inchangés — `CarouselPhotoResult` sait déjà afficher des slides `photo_full` sans overlay.

## Implémentation

### Branchement précoce du flow (`src/pages/CreerUnifie.tsx`)

- `handleFormatNext` quand `format === "carousel"` && `carouselSubMode === "pure_photo"` : passer directement à une nouvelle fonction `generatePurePhotoCarousel()` au lieu d'appeler `generateQuestions` / `generateStructure`.
- Couvrir aussi les chemins d'entrée coach (`handleCoachingSelect`) et calendrier le cas échéant.
- Le stepper passe directement de `format` → `result`.

### Nouvelle fonction `generatePurePhotoCarousel()`

Construit le `result` côté client :

```
raw.slides = uploadedPhotos.map((p, i) => ({
  slide_number: i + 1,
  slide_type: "photo_full",
  photo_index: i + 1,
  role: i === 0 ? "hook" : i === uploadedPhotos.length - 1 ? "cta" : "body",
  overlay_text: null, title: "", body: "",
}));
raw.no_overlay = true;
raw.carousel_type = "photo";
```

Puis appelle une edge function pour la **légende seule** :

- **LinkedIn carousel** : réutiliser `generateLinkedInCarouselCaption()` déjà présent (lignes 1140-1153).
- **Instagram** : ajouter un type `caption_only` à `carousel-ai` côté edge qui prend `subject + objective + editorial_angle + photos[].context + photo_description` et renvoie `{ caption: { hook, body, cta, hashtags } }` — pas de slides. À défaut, déclencher un appel simple à `creative-flow` avec un contentType dédié.

### Post-process existant

L'effect `purePhotoStrippedRef` (lignes 1157-1177) devient redondant pour les nouveaux résultats mais reste en place — il sert de filet de sécurité pour les résultats déjà persistés en sessionStorage.

## Hors scope

- Modes `photo` (overlay texte) et `mix` : flow inchangé (questions + structure review).
- Pas de changement sur la limite max photos (10).
- Pas de retouche des libellés du picker.

## Validation

- `pure_photo` + 2 photos → exactement 2 slides, photo 1 puis photo 2, aucune duplication, légende cohérente avec les 2 photos.
- 5 photos → 5 slides.
- Export PPTX : N slides photo plein écran.
- Régression : modes `photo` et `mix` génèrent toujours leurs 6-10 slides via la structure review.