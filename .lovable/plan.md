## Problème

Sur l'étape Format → Carrousel "Photo" ou "Mixte", la zone d'upload des photos est invisible : aucune drop zone, aucun bouton "+ Ajouter", rien.

## Cause

`CreerStepFormat.tsx` (ligne 584) passe `compact` en dur à `<PhotoUploadZone>`. Or, en mode compact, `PhotoUploadZone` :

- masque la grande drop zone (`!compact`)
- n'affiche le bouton "+ Ajouter d'autres photos" et les vignettes que **si `photos.length > 0`**
- masque aussi la textarea de description

Conséquence : tant que l'utilisateur n'a aucune photo, le composant ne rend rien d'actionnable. Le mode `compact` est conçu pour les étapes où des photos ont déjà été importées en amont — ce qui n'est pas le cas du carrousel Photo/Mix (c'est la première occasion d'uploader).

## Correctif

Dans `src/components/creer/CreerStepFormat.tsx` (ligne 572-605), passer `PhotoUploadZone` en mode **non-compact uniquement quand aucune photo n'est encore présente**, puis basculer en compact dès qu'au moins une photo est uploadée :

```tsx
<PhotoUploadZone
  maxPhotos={10}
  initialPhotos={uploadedPhotos.length > 0 ? uploadedPhotos : undefined}
  initialDescription={photoDescription}
  onPhotosChange={(photos) => {
    setUploadedPhotos(photos);
    if (photos.length > 0) setPhotoWarning(false);
  }}
  onDescriptionChange={setPhotoDescription}
  title={uploadedPhotos.length > 0 ? `Vos photos (${uploadedPhotos.length})` : undefined}
  compact={uploadedPhotos.length > 0}   {/* ← seul changement */}
/>
```

### Pourquoi cette approche

- **Premier upload** : drop zone large + textarea description visibles → l'utilisateur voit clairement où importer.
- **Photos déjà présentes** : passage automatique en compact → vignettes + bouton discret "+ Ajouter d'autres photos", sans la grosse drop zone redondante.
- Aucun changement nécessaire dans `PhotoUploadZone.tsx` : on respecte sa sémantique existante.

## Hors scope

- Le warning console `Function components cannot be given refs` sur `PhotoUploadZone` / `CreerStepQuestions` est un autre sujet (préexistant, non bloquant). À traiter séparément si tu veux nettoyer.
- Pas de modification du flow Étape 2/3 PPTX hybride en cours.

## Validation

- Aller sur Créer → choisir Instagram → Carrousel → Photo (ou Mixte).
- Vérifier que la grande drop zone "Glisse tes photos ici" + textarea description sont visibles immédiatement.
- Importer une photo → la drop zone disparaît, remplacée par la vignette + le bouton "+ Ajouter d'autres photos".
- Supprimer toutes les photos → la drop zone réapparaît.