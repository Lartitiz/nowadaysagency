

## Plan — Contexte optionnel par photo dans `PhotoUploadZone`

### Périmètre strict
Un seul fichier touché : `src/components/creer/PhotoUploadZone.tsx`. Aucune modification ailleurs (CreerUnifie, Edge Functions, autres composants). Les 4 usages actuels du composant continuent de fonctionner sans changement.

### Modifications

**1. Type étendu**
```ts
export interface PhotoItem {
  base64: string;
  preview: string;
  name: string;
  context?: string; // nouveau, optionnel
}
```
Rétrocompatible : tous les consommateurs actuels qui ignorent `context` continuent de marcher.

**2. Nouvel état local**
- `showContexts: boolean` (default `false`) → contrôle l'affichage des inputs par photo.
- Aucun nouvel état pour les valeurs : le `context` vit directement dans `photos[i].context`.

**3. Lien discret toggle**
Apparaît **uniquement si `photos.length > 0`**, positionné **juste au-dessus de la grille** (plus visible et logique : "voici tes photos, veux-tu les annoter ?").

```tsx
<button
  type="button"
  onClick={() => setShowContexts(v => !v)}
  className="text-xs text-primary hover:underline font-medium"
>
  {showContexts ? "− Masquer les contextes" : "+ Ajouter un contexte par photo"}
</button>
```

**4. Input contextuel sous chaque vignette**
Quand `showContexts === true`, un `<Input>` apparaît **sous** chaque thumbnail (pas à côté), dans une cellule de grille élargie verticalement.

Refactor de la grille : chaque cellule devient un wrapper flex-col contenant la vignette + l'input optionnel.

```tsx
<div className="flex flex-col gap-1.5">
  <div className="relative aspect-square ...">{/* vignette existante */}</div>
  {showContexts && (
    <Input
      value={p.context ?? ""}
      onChange={(e) => updateContext(idx, e.target.value)}
      placeholder="Ex : chantier Acacias, J2 démolition"
      maxLength={200}
      className="h-8 text-xs"
    />
  )}
</div>
```

**5. Handler `updateContext`**
```ts
const updateContext = (idx: number, value: string) => {
  const next = photos.map((p, i) => i === idx ? { ...p, context: value } : p);
  updatePhotos(next);
};
```
Réutilise `updatePhotos` existant → propagation automatique via `onPhotosChange` (signature inchangée).

**6. Conservation du contexte lors du drag/réorder/suppression**
Déjà gratuit : le `context` étant une propriété de `PhotoItem`, il suit l'objet quand `splice`/`filter` est appliqué dans `onThumbDragOver` et `removePhoto`. Aucune modif nécessaire sur ces handlers.

### Ce qui ne change pas
- Drop zone, drag & drop fichiers, resize/encode, suppression, réordonnancement
- Description globale (`description`, `onDescriptionChange`, label, textarea)
- Signatures des props et callbacks
- `initialPhotos` / `initialDescription` (un consommateur qui restaure des photos avec `context` aura le contexte restauré ; sans `context` ça reste `undefined`, comportement actuel préservé)

### Détails design
- Lien : `text-xs text-primary hover:underline` (discret, rose framboise du theme)
- Input : `h-8 text-xs` (compact pour ne pas dominer la vignette), `maxLength=200`
- Transition : pas d'anim complexe, juste apparition conditionnelle (fluide naturellement)
- Le label "1 / 10 photos" reste sous la grille, intact

### Réponses aux questions ouvertes
- **Placeholder** : générique `"Ex : chantier Acacias, J2 démolition"` (le composant ne connaît pas le type de photo ; un placeholder dynamique nécessiterait une nouvelle prop, hors scope).
- **Limite caractères** : `maxLength={200}` — suffisant pour un contexte court, contraint l'utilisateur à rester précis (l'IA n'a pas besoin de plus pour identifier une scène).
- **Position du lien** : **au-dessus** de la grille — plus naturel comme call-to-action après l'upload, et évite que le label "X / Y photos" soit séparé visuellement de la grille.

### Validation
- `npx tsc --noEmit --skipLibCheck` doit passer (champ optionnel, pas de breaking change)
- Les 4 usages existants compilent sans modification
- Test manuel : upload 3 photos → toggle déplie → saisir contexte slide 2 → réordonner → contexte suit la bonne photo → supprimer une photo → contextes restants OK → replier → description globale toujours fonctionnelle

### Hors scope (plans séparés à venir)
- Propagation `context` vers Edge Functions (`carousel-ai`, `creative-flow`)
- Bouton "Partir de photos" dans `CreerUnifie`
- Persistance localStorage

