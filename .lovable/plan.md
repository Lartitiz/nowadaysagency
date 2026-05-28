# Étape 1/4 — Envoyer toutes les photos à l'étape "questions"

On avance **un point à la fois** pour pouvoir tester entre chaque correction. Cette première étape débloque le fix backend déjà déployé : sans elle, l'edge function ne reçoit toujours qu'une seule photo et continue d'inventer le contexte des autres.

## Changement

Fichier : `src/hooks/use-content-generator.ts`, lignes 571-573 (étape `questions` de `creative-flow`).

Avant :
```ts
photos: photoModeCF
  ? [{ base64: params.photos![0].base64, mimeType: params.photos![0].mimeType || "image/jpeg", context: params.photos![0].context }]
  : undefined,
```

Après :
```ts
photos: photoModeCF
  ? params.photos!.slice(0, 10).map(p => ({
      base64: p.base64,
      mimeType: p.mimeType || "image/jpeg",
      context: p.context,
    }))
  : undefined,
```

## Hors scope (étapes suivantes, à valider après test)

- **Étape 2** : même correction sur le fallback Instagram non-stream (ligne 333).
- **Étape 3** : timeout `questions` 90s → 180s en mode photo (ligne 577).
- **Étape 4** : passer les photos au step `follow-up` (lignes 632-640).

## Test après application

Lancer "Partir de photos" avec 3-4 photos sur LinkedIn → les questions générées doivent référencer les photos 2, 3, 4 (pas seulement la première).
