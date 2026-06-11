## Fichier modifié

`src/lib/pptx-font-mapping.ts` — uniquement la fonction `mapFontToPptx` et son commentaire de doc.

## Changement

1. Réécrire `mapFontToPptx` pour retourner le vrai nom de la première police de la stack, nettoyé des quotes, au lieu d'une substitution vers une police système.
2. Seuls les mots-clés CSS génériques (`serif`, `sans-serif`, `system-ui`, `ui-sans-serif`, `monospace`, `ui-monospace`, `cursive`, `fantasy`) sont mappés vers une police système équivalente (insensible à la casse).
3. Fallback inchangé : `null`/`undefined`/`""` → `"Calibri"`.
4. Supprimer les constantes devenues inutiles : `SERIF_FONTS`, `MONO_FONTS`, `VERDANA_FONTS`, `TREBUCHET_FONTS`.
5. Mettre à jour le commentaire JSDoc pour refléter le nouveau comportement (compatibilité Canva).

## Critères de validation

- `npx tsc --noEmit --skipLibCheck` passe sans erreur.
- `mapFontToPptx('"Libre Baskerville", Georgia, serif')` → `"Libre Baskerville"`
- `mapFontToPptx("'IBM Plex Sans', sans-serif")` → `"IBM Plex Sans"`
- `mapFontToPptx("serif")` → `"Georgia"`
- `mapFontToPptx(null)` et `mapFontToPptx("")` → `"Calibri"`