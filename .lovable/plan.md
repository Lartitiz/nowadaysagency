# Fix bug upload logo HEIC

## Diagnostic

Dans `src/pages/BrandCharterPage.tsx` (`handleLogoUpload`, lignes 462-480) :
- `accept="image/*"` laisse passer les `.heic`/`.heif` exportés depuis un iPhone/Mac.
- Le fichier est uploadé tel quel dans Supabase Storage (`brand-assets/{user}/logo/logo.heic`).
- Le bucket renvoie bien une URL publique, **mais aucun navigateur (Chrome/Firefox/Edge) ne sait afficher du HEIC** → l'`<img src={data.logo_url}>` (ligne 664) casse, le logo apparaît vide/cassé, et tous les exports (carrousels, Pinterest, PPTX) qui vont charger ce logo via `fetch` puis l'embarquer dans une slide vont également échouer côté rendu.
- En plus l'extension est dérivée naïvement de `file.name.split(".").pop()` → `HEIC` en majuscule donne un path différent à chaque upload.

## Plan

### 1. Conversion HEIC → JPEG côté client
- Ajouter la dépendance `heic2any` (≈ 200 ko, lazy-loadée pour ne pas alourdir le bundle initial).
- Dans `handleLogoUpload` :
  - Détecter HEIC/HEIF via `file.type` (`image/heic`, `image/heif`) **et** fallback extension (`.heic`, `.heif`) car Safari/Finder ne renseignent pas toujours le MIME.
  - `await import("heic2any")` puis convertir en `image/jpeg` qualité 0.92.
  - Remplacer `file` par le `Blob` converti, forcer `ext = "jpg"` et `contentType: "image/jpeg"` lors du `upload`.
  - Toast d'info pendant la conversion (« Conversion HEIC… ») car ça peut prendre 1-3 s sur gros fichiers.
- Normaliser l'extension en minuscule + whitelist (`jpg|jpeg|png|webp|svg`) sinon refus avec message clair.

### 2. UX upload
- `accept="image/*,.heic,.heif"` pour que la boîte de dialogue Mac propose explicitement les HEIC.
- Guard taille : refuser > 5 Mo avec toast (un HEIC iPhone fait souvent 3-4 Mo, le JPEG converti reste raisonnable).
- Message d'erreur plus précis : afficher `err.message` au lieu du toast générique pour faciliter le debug futur.

### 3. Vérifications connexes
- Les autres uploads images du projet (avatars, visuels persona) utilisent les mêmes pickers ? → audit rapide de `rg "accept=\"image"` pour confirmer si on doit étendre la conversion (hors scope si non utilisés, juste signaler).

## Détails techniques

- `heic2any` est browser-only (utilise `libheif` compilé en WASM). L'import dynamique évite tout souci SSR/Vite.
- Pas de changement DB ni RLS : on upload toujours dans le bucket existant `brand-assets`.
- Pas de migration nécessaire pour les logos déjà uploadés en HEIC (s'il y en a) — on pourra les ré-uploader manuellement.

## Hors scope

- Conversion côté Edge Function (inutile, le client fait le job).
- Génération automatique de variantes (favicon, dark/light) — déjà discuté précédemment et non demandé.
