# Plan — Choisir des photos de la photothèque dans PhotoUploadZone

Objectif : connecter la photothèque (`user_photos`) au flow de création. Une utilisatrice qui a préparé ses photos détourées dans `/photos` peut les réinjecter directement dans la zone d'upload, sans re-télécharger.

## Fichiers modifiés / créés

1. **`src/lib/photo-storage.ts`** — ajouter `userPhotoToBase64`
2. **`src/components/photos/PhotoLibraryPickerDialog.tsx`** — nouveau composant
3. **`src/components/creer/PhotoUploadZone.tsx`** — bouton + intégration

Aucun autre fichier touché. Aucun changement Edge Function. `PhotosPage` et `PhotoDetailDialog` ne bougent pas.

## 1. Helper `userPhotoToBase64`

Dans `src/lib/photo-storage.ts`, nouvelle fonction exportée :

- Signature : `userPhotoToBase64(photo: UserPhotoRow): Promise<{ base64: string; mimeType: string; name: string }>`
- `getSignedPhotoUrl(photo.storage_path, 300)` → si null, throw `"Impossible de charger la photo."`
- `fetch(url)` → `blob()` → `FileReader.readAsDataURL` → résultat = data URL complète (incluant le préfixe `data:image/...;base64,...`, format attendu par `PhotoItem.base64` ailleurs dans `PhotoUploadZone`)
- `mimeType = blob.type || "image/jpeg"`
- `name = photo.name || "photo"`

## 2. `PhotoLibraryPickerDialog`

Nouveau composant `src/components/photos/PhotoLibraryPickerDialog.tsx`.

Props :

```ts
{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  maxSelectable: number;
  onConfirm: (photos: UserPhotoRow[]) => void;
}
```

Comportement :

- `useUserPhotos()` (filtrage workspace déjà géré) → ne garder que `status === "ready"`
- Grille responsive de vignettes (réutilise le pattern des signed URLs de `PhotoCard` : chargement async dans un `useEffect`, fallback skeleton)
- Sélection multiple par clic : ring `primary` + petit check en overlay quand sélectionnée
- Compteur `N / maxSelectable sélectionnées` en footer
- Au-delà de `maxSelectable`, les vignettes non sélectionnées deviennent non cliquables (cursor disabled, opacité réduite)
- État vide (aucune photo `ready`) : message bienveillant + lien `/photos` (« Ta photothèque est vide. Ajoute tes photos ici. »)
- Boutons footer : « Annuler » (ferme), « Utiliser ces photos » (disabled si 0 sélectionnée) → `onConfirm(selected)` puis `onOpenChange(false)`
- Reset de la sélection à chaque ouverture

## 3. Intégration dans `PhotoUploadZone`

- État local : `libraryOpen: boolean`, `importingFromLibrary: boolean`
- Lien discret « 📚 Choisir dans mes photos » :
  - en mode normal (dropzone vide) : sous la zone de drop
  - en mode compact (photos déjà présentes) : à côté de « + Ajouter d'autres photos »
  - Disabled si `photos.length >= maxPhotos` ou pendant un import
- Click → ouvre `PhotoLibraryPickerDialog` avec `maxSelectable = maxPhotos - photos.length`
- `onConfirm` :
  - `setImportingFromLibrary(true)`
  - `Promise.allSettled(selected.map(userPhotoToBase64))`
  - Pour chaque succès, construire un `PhotoItem` :
    ```ts
    {
      id: crypto.randomUUID(),
      base64, // data URL complète
      preview: base64,
      name,
      mimeType,
      context: "",
    }
    ```
  - Pour chaque échec, `toast.error` ciblé (comme `processFiles` fait pour les fichiers en échec)
  - `updatePhotos([...photos, ...newItems].slice(0, maxPhotos))`
  - `setImportingFromLibrary(false)` puis ferme le dialog
- Loader (spinner + texte « Import… ») sur le bouton pendant la conversion

Les photos importées sont ensuite indistinguables des photos uploadées : contexte, reorder, suppression, retouche PhotoRoom, payload de génération, tout fonctionne via les mêmes chemins de code.

## Ce qui ne bouge PAS

- `processFiles`, `resizeAndEncode`, conversion HEIC, drag & drop
- `PhotosPage`, `PhotoDetailDialog`, `PhotoCard`
- Interface `PhotoItem` (aucun champ nouveau)
- Edge Functions
- Filtrage workspace (on s'appuie strictement sur `useUserPhotos`)

## Critères de validation

- `npx tsc --noEmit --skipLibCheck` passe
- `/photos` → retoucher une photo → `/creer` → carrousel photo → « Choisir dans mes photos » → 2 photos sélectionnées → présentes dans la grille, génération OK
- Photothèque vide → état vide avec lien `/photos`
- `maxPhotos` atteint → picker limite la sélection et désactive le bouton
- Workspace manager : seules les photos du workspace actif visibles

## Hors scope (confirmé)

- Inverse (bouton « Créer un contenu » depuis `PhotoDetailDialog`)
- Sauvegarde auto des uploads dans la photothèque
- Tags / recherche dans le picker

## Améliorations connexes proposées (à valider une par une avant build)

(a) **Demandé** : tout ce qui précède.

(b) **Propositions optionnelles** — je n'implémente que si tu valides :

1. **Tri par date desc** dans le picker (plus récentes en premier) — 2 lignes, gros gain UX, aucun risque.
2. **Préchargement parallèle des signed URLs** (`Promise.all` au lieu du chargement vignette par vignette) pour éviter le flash de skeletons à l'ouverture — petit refactor isolé au composant picker.
3. **Badge de count sur le bouton** (« 📚 Choisir dans mes photos · 12 »), seulement si `useUserPhotos` renvoie un total > 0 — incite à utiliser la fonctionnalité.

Dis-moi lesquelles tu veux que j'inclue, ou « aucune » pour rester strictement sur le périmètre demandé.
