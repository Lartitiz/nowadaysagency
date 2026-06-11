## Objectif

Ajouter la possibilité, dans le dialog "Modifier le fond" (PhotoEditDialog), de fournir une **image** à utiliser comme arrière-plan — en plus des presets et du prompt texte.

## Diagnostic

Aujourd'hui PhotoEditDialog propose 3 modes via la même API `photoroom-edit` :
- preset `transparent` → `mode: remove_bg`
- preset `studio_white` / `golden_hour` → `mode: replace_bg` + prompt texte
- prompt libre → `mode: replace_bg` + prompt texte

L'edge function `photoroom-edit` appelle Photoroom v2 (`/v2/edit`) avec uniquement `background.prompt`. Or Photoroom v2 accepte aussi `background.imageFile` (image envoyée en multipart) pour utiliser une image comme fond, avec le sujet détouré par-dessus.

## Changements

### 1. Frontend — `src/components/creer/PhotoEditDialog.tsx`

- Ajouter un 3ᵉ bloc "Ou utilise ta propre image de fond" entre les presets et le prompt libre :
  - Bouton "Choisir une image de fond" → ouvre un `<input type="file" accept="image/*">` masqué.
  - Une fois choisie, afficher une vignette + bouton "Retirer".
  - Convertir le fichier en base64 (data URL) côté client, stocker dans `bgImageBase64`.
- Quand `bgImageBase64` est défini :
  - Désélectionner tout preset, désactiver la textarea prompt (mêmes règles d'exclusivité que "transparent").
  - `handleGenerate` envoie `mode: "replace_bg"` + `background_image_base64` (et pas de prompt).
- Reset de `bgImageBase64` dans le `useEffect(open)`.
- Validation côté client : taille max 5 Mo, types image, sinon toast d'erreur.

### 2. Backend — `supabase/functions/photoroom-edit/index.ts`

- Étendre `BodySchema` : ajouter `background_image_base64: z.string().min(100).optional()`.
- Adapter le `.refine` : pour `replace_bg`, accepter **soit** un prompt ≥ 3 caractères **soit** un `background_image_base64`.
- Dans `callPhotoroom`, si `background_image_base64` présent :
  - Décoder en bytes + mime (réutiliser `decodeBase64Image`).
  - `fd.append("background.imageFile", new Blob([bgBytes], { type: bgMime }), "bg." + ext)`.
  - Ne pas envoyer `background.prompt`.
- Sinon, comportement actuel inchangé.
- Aucun changement de quota / catégorie / rate limit.

## Hors scope

- Pas de stockage persistant de l'image de fond (purement en mémoire, comme la photo originale du dialog).
- Pas de bibliothèque d'images de fond pré-fournie.
- Pas de modification du flux `photo-background-replace` (variante persistante non utilisée ici).
- Pas de changement UX sur les autres dialogs ou étapes.

## Test manuel

1. Ouvrir une photo → "Modifier le fond" → cliquer "Choisir une image de fond" → uploader un JPG/PNG.
2. Lancer "Générer le nouveau fond" → l'aperçu montre le sujet détouré sur l'image fournie.
3. "Retirer" l'image de fond → on peut revenir à un preset ou prompt texte.
4. Tester aussi presets + prompt texte (régression : doivent toujours marcher).
