# Extraction des couleurs du logo → proposition de palette

## Objectif

Quand l'utilisateur upload (ou change) son logo dans `BrandCharterPage`, on **extrait les couleurs dominantes** et on lui propose (dialog de confirmation) de les appliquer à sa palette de marque — sans écraser silencieusement ce qu'il a déjà saisi.

## Comportement UX

1. Upload du logo → conversion HEIC + upload Supabase (déjà en place).
2. Une fois l'image affichable, on lance l'extraction côté client (canvas).
3. On ouvre un `Dialog` :
   - Titre : « On a repéré ces couleurs dans ton logo »
   - Aperçu des 5 swatches détectées (primary, secondary, accent, background, text) avec hex.
   - Deux boutons : **« Appliquer à ma palette »** / **« Ignorer »**.
   - Bonus : checkbox « Remplacer aussi mes couleurs custom » (off par défaut).
4. Si on applique, on met à jour `color_primary`, `color_secondary`, `color_accent`, `color_background`, `color_text` via le même `onDataChange` que `applyPalette` (ligne 110 de `CharterColorsSection`) → `triggerSave` enchaîne automatiquement.
5. Toast de confirmation.

## Implémentation technique

### 1. Helper d'extraction `src/lib/extract-logo-palette.ts`
- Fonction `extractLogoPalette(blob: Blob): Promise<{primary, secondary, accent, background, text}>`.
- Pipeline :
  - Charger le blob dans une `<img>` via `URL.createObjectURL`.
  - Dessiner sur un canvas 200×200 (downscale pour perf).
  - Quantization simple **maison** (median cut allégé sur ~40 buckets HSL) — **pas de dépendance externe** pour rester léger. Filtre les pixels quasi-transparents (alpha < 200).
  - Trier par fréquence puis par saturation.
  - Heuristiques :
    - `primary` = couleur la plus fréquente non-neutre (sat > 0.15).
    - `secondary` = 2e plus fréquente non-neutre, distance HSL > seuil.
    - `accent` = couleur saturée minoritaire (la plus contrastée).
    - `background` = couleur la plus claire (luminance > 0.85) sinon `#FFFFFF`.
    - `text` = couleur la plus sombre (luminance < 0.2) sinon `#111111`.
  - Fallback : si pas assez de couleurs distinctes, compléter avec gris neutres.
- SVG : si `contentType === "image/svg+xml"`, on rasterise via un `Image` + canvas standard — fonctionne tant que le SVG est self-contained.

### 2. Wiring dans `BrandCharterPage`
- Dans `handleLogoUpload`, après le `update("logo_url", …)` et avant le toast success :
  - `const palette = await extractLogoPalette(uploadFile).catch(() => null);`
  - Si `palette`, ouvrir un nouvel état `logoPaletteProposal` (state local) qui contient `{ colors, includeCustom }`.
- Ajouter un composant `<LogoPaletteDialog>` (nouveau fichier `src/components/branding/charter/LogoPaletteDialog.tsx`) basé sur shadcn `Dialog`, contrôlé par cet état.
- Apply → `setData(prev => ({ ...prev, color_primary, color_secondary, ... }))` + `triggerSave()`.

### 3. Bouton manuel
Ajouter un petit bouton **« 🎨 Extraire les couleurs du logo »** sous l'aperçu du logo (visible uniquement si `data.logo_url` existe). Permet de relancer l'extraction sans ré-uploader. Réutilise le même dialog.

## Détails & garde-fous

- Tout est **client-side**, aucune edge function, aucune dépendance externe (canvas + algo maison ~80 lignes).
- Pas d'écrasement sans confirmation explicite.
- Si extraction échoue (canvas tainted CORS sur un logo déjà en CDN, par exemple), on `catch` et on n'affiche rien — pas d'erreur visible à l'user.
- Pas de modif DB / RLS / schéma.

## Hors scope

- Génération de palettes "intelligentes" via IA (Claude) à partir du logo — possible plus tard si l'extraction maison ne suffit pas.
- Génération automatique de variantes de logo (déjà discutée ailleurs).
- Application aux exports visuels — séparé.
