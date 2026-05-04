# Plan — Fiabiliser l'upload photo (carousel Instagram)

## Diagnostic

Les erreurs visibles dans la console de la cliente :
```
Unhandled rejection: Error: load
  at d.onerror (CreerUnifie-…js:21:22175)
```
…proviennent de `src/components/creer/PhotoUploadZone.tsx`, fonction `resizeAndEncode` :

```ts
img.onerror = () => reject(new Error("load"));
```

### Cause racine

1. **Format non décodable par le navigateur** — quasi-certain : la cliente est probablement sur iPhone, ses photos sont en **HEIC/HEIF**. L'`<input accept="image/*">` les accepte, mais Chrome/Firefox/Safari desktop ne savent pas les rendre via `<img>` → `onerror` "load".
2. **Aucun try/catch autour de `processFiles`** : `Promise.all` rejette, l'erreur remonte en `unhandledrejection`, **aucun toast ne s'affiche**, la cliente voit juste "rien ne se passe".
3. **Pas de garde-fou de taille** : un fichier 50 Mo finit aussi en échec silencieux.

Les autres erreurs visibles (Invalid Refresh Token, PostHog token manquant) sont **indépendantes** de ce bug et n'empêchent pas l'upload.

## Correctifs

### 1. Convertir le HEIC à la volée (priorité 1)
Dans `PhotoUploadZone.tsx` :
- Ajouter dépendance `heic2any` (lib client, ~80 Ko, fonctionne dans le navigateur).
- Dans `processFiles`, détecter `file.type === "image/heic" | "image/heif"` ou extension `.heic/.heif` (Safari iOS envoie parfois un type vide), et convertir en JPEG **avant** `resizeAndEncode`.
- Limiter à 25 Mo / fichier.

### 2. Gérer les erreurs proprement
- Wrapper chaque conversion dans un `Promise.allSettled` au lieu de `Promise.all`.
- Pour chaque rejet : afficher un `toast.error` clair, ex :
  - « Impossible de lire `IMG_1234.HEIC`. Convertis-la en JPEG ou réessaie. »
  - « `photo.png` est trop lourde (32 Mo). Compresse-la avant upload. »
- Garder les photos qui ont réussi.

### 3. Améliorer l'UX du `<input>`
- Restreindre `accept` : `image/jpeg,image/png,image/webp,image/heic,image/heif` (évite PDF / vidéos déposés par erreur).
- Sous le drop-zone, ajouter une note : « Les photos iPhone (HEIC) sont converties automatiquement. »

### 4. Logs de debug
- En cas d'erreur de conversion, log `console.warn("[photo-upload] failed", file.name, file.type, file.size, err)` pour diagnostiquer les futurs cas.

## Fichiers touchés

- `src/components/creer/PhotoUploadZone.tsx` — conversion HEIC + gestion d'erreurs + toasts
- `package.json` — ajout `heic2any`

## Hors scope

- Erreur Refresh Token Supabase (souvent un onglet resté ouvert trop longtemps — à traiter séparément si récurrent).
- Avertissement PostHog (config indépendante, pas bloquant).
- Autres `PhotoUploadZone` du flow (`CreerStepFormat.tsx`) bénéficient automatiquement du fix puisqu'on patche le composant partagé.

## Test de validation

1. Uploader une photo `.HEIC` exportée d'un iPhone → doit apparaître dans la grille comme JPEG.
2. Uploader un fichier `.mp4` → toast d'erreur clair, pas de crash.
3. Uploader un mix (1 HEIC + 1 JPEG) → les deux apparaissent.
