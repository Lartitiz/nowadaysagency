# Édition de fond par photo (PhotoRoom)

## Objectif

Permettre à l'utilisateur·ice, depuis l'étape « Pars de tes photos » (et partout où on uploade des photos), de retoucher chaque vignette en un clic : retirer le fond et/ou en générer un nouveau via un prompt IA.

## Parcours utilisateur (le plus simple possible)

1. L'utilisateur uploade ses photos comme aujourd'hui.
2. Au survol d'une vignette, une **icône baguette ✨** apparaît en haut-gauche (à côté de la croix de suppression).
3. Clic → ouverture d'une **mini-modale d'édition** centrée sur cette photo :
   - **Aperçu** de la photo originale + photo retouchée côte à côte.
   - **3 presets en 1 clic** (chips) : *Fond blanc studio* · *Fond transparent* · *Lumière douce dorée*.
   - **Champ libre** « Décris le fond que tu veux » (placeholder : *ex : plage au coucher du soleil, bokeh chaleureux*).
   - Bouton **Générer**. Pendant le traitement : skeleton + spinner sur l'aperçu.
   - Boutons finaux : **Annuler** · **Réessayer** · **Utiliser cette version**.
4. À la validation, la vignette dans la grille est remplacée par la version retouchée. Un petit badge ✨ apparaît en bas à droite pour indiquer qu'elle a été éditée. Un menu sur ce badge permet de **revenir à l'original**.

L'original est conservé en mémoire pendant toute la session pour permettre l'annulation et la régénération.

## Architecture technique

### 1. Edge Function `photoroom-edit`

Nouveau fichier `supabase/functions/photoroom-edit/index.ts`.

- `verify_jwt = false` dans `supabase/config.toml`, auth manuelle via `supabase.auth.getUser()`.
- Input (JSON) : `{ image_base64: string, mode: 'remove_bg' | 'replace_bg', prompt?: string }`.
- Validation Zod (image présente, prompt ≤ 300 car. si `replace_bg`).
- Appel **PhotoRoom Image Editing v2** (`https://image-api.photoroom.com/v2/edit`) en `multipart/form-data` :
  - Header `x-api-key: PHOTOROOM_API_KEY`.
  - Champ `imageFile` = blob de l'image.
  - Si `replace_bg` : `background.prompt = <prompt utilisateur>`.
  - Si `remove_bg` : pas de `background.prompt` → fond transparent (PNG).
- Réponse : on relit le binaire, on le re-encode en base64 et on renvoie `{ image_base64, mime_type }`.
- Gestion d'erreurs : 400 (validation), 402 (quota PhotoRoom), 502 (upstream).
- CORS standard, wrap dans try/catch, logs concis.

### 2. Composant `PhotoEditDialog`

Nouveau fichier `src/components/creer/PhotoEditDialog.tsx`.

- Basé sur `Dialog` de shadcn.
- Props : `{ open, onOpenChange, photo: PhotoItem, onApply: (newBase64) => void }`.
- État local : `prompt`, `isGenerating`, `previewBase64` (résultat courant), `selectedPreset`.
- Layout : grille 2 colonnes (Avant / Après), chips presets, textarea, boutons d'action.
- Appel via `invokeWithTimeout('photoroom-edit', body, 60_000)` (resiliency standard du projet).
- Toast d'erreur en cas d'échec, rien n'est appliqué tant que l'utilisateur n'a pas cliqué « Utiliser cette version ».

### 3. Intégration dans `PhotoUploadZone`

Fichier `src/components/creer/PhotoUploadZone.tsx`.

- Étendre `PhotoItem` avec `originalBase64?: string` et `edited?: boolean`.
- Ajouter sur chaque vignette un bouton **baguette** (icône `Wand2` de lucide) symétrique à la croix actuelle, visible au hover.
- Au clic → ouvre `PhotoEditDialog` pour cette photo.
- Sur `onApply(newBase64)` : remplace `base64` + `preview` (régénérer un objectURL depuis le nouveau base64), conserve `originalBase64` la première fois, marque `edited: true`.
- Ajouter un petit badge ✨ en bas-droite quand `edited` est vrai, avec un menu `Revenir à l'original`.

### 4. Aucune migration DB requise

Les photos sont déjà gérées en base64 côté client et ne sont pas persistées dans le bucket à cette étape.

## Détails UI / copies

- Titre modale : **Modifier le fond**.
- Sous-titre : *L'IA détoure ta photo et remplace l'arrière-plan.*
- Presets (boutons rapides) :
  - `Fond studio blanc` → prompt `clean white studio background, soft shadow`
  - `Fond transparent` → mode `remove_bg`
  - `Lumière dorée` → prompt `warm golden hour lighting, soft bokeh background`
- Bouton principal : **Générer le nouveau fond** → en cours : *Génération…*
- Tooltip sur la baguette : *Modifier le fond avec l'IA*.

## Diagramme du flux

```text
Vignette photo
   │ (hover) ✨
   ▼
PhotoEditDialog
   │ prompt + Générer
   ▼
invoke('photoroom-edit', { image_base64, mode, prompt })
   │
   ▼
Edge Function ──► PhotoRoom Image Editing v2 ──► PNG/JPEG
   │
   ▼
Aperçu « Après »
   │ Utiliser cette version
   ▼
PhotoUploadZone met à jour la vignette + badge ✨
```

## Hors scope (pour plus tard si besoin)

- Sauvegarde des versions éditées dans le bucket `user-photos`.
- Édition multi-photos en lot.
- Réglages avancés (taille, ombre, recadrage).
- Historique de plus d'une version (on garde uniquement original ↔ dernière édition).
