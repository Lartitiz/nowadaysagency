## Objectif

Quand on arrive à l'étape 2 (Format) sur Instagram avec des photos préchargées :

1. **2+ photos** → la grille Insta n'affiche **que la carte "Carrousel"** (les autres formats compatibles photo — Post photo, Reel, Story — sont masqués).
2. **1 photo** → comportement actuel inchangé (Post photo, Reel, Story, Carrousel disponibles).
3. Dès qu'on clique sur "Carrousel" (ou s'il est auto-sélectionné), le **sous-picker des 3 types de carrousel s'affiche immédiatement** en dessous, sans collapse — l'utilisateur choisit `full photo`, `storytelling`, ou `juste photo` dans la foulée.

## Changements

**Fichier touché : `src/components/creer/CreerStepFormat.tsx`** (uniquement, pas de backend).

### 1. Filtrer la grille Insta à 2+ photos (ligne 487)

Remplacer le filtre actuel :
```ts
spec.channel === "instagram" && (!hasPreloadedPhotos || formatAcceptsSinglePhoto(id) || id === "carousel")
```
par une logique 2+ photos :
```ts
const photoCount = initialPhotos?.length ?? 0;
const multiPhotos = photoCount >= 2 && !forceShowAll;
// filtre
spec.channel === "instagram" && (
  multiPhotos ? id === "carousel"
  : !hasPreloadedPhotos || formatAcceptsSinglePhoto(id) || id === "carousel"
)
```

À 2+ photos, seule la carte Carrousel reste visible dans la grille.

### 2. Auto-dérouler le sous-picker

Le sous-picker (lignes 589-668) est déjà conditionné par `selectedFormat === "carousel"`. Quand l'utilisateur clique la carte Carrousel, `selectedFormat` passe à `"carousel"` et le picker s'affiche déjà.

Le seul changement comportemental : **ne pas afficher la version "chip collapsed"** quand on vient de cliquer Carrousel — on garde le picker complet visible jusqu'à ce que les 3 cartes soient cliquées. Actuellement la chip s'affiche dès que `carouselSubMode` est défini, ce qui est bien — pas de changement nécessaire ici.

En revanche, pour que le sous-picker soit immédiatement visible **sans avoir à scroller**, ajouter un `scrollIntoView` doux dans `handleFormatSelect` quand `id === "carousel"` et `carouselSubMode === null`.

### 3. Hint sous la grille (ligne 383-409)

Adapter le texte d'aide quand `multiPhotos` est vrai :
> "Avec plusieurs photos, on part forcément sur un carrousel. Choisis le type ci-dessous."

Avec un lien "Tout afficher quand même" qui bascule `forceShowAll = true` pour réafficher Post / Reel / Story (comportement déjà existant).

## Hors scope

- Pas de modification du backend (`carousel-ai`, etc.).
- Pas de changement sur LinkedIn ou Pinterest.
- Pas de changement du flux 1 photo unique.
- Pas de modification des prompts ou de la génération.

## Récap UX

| Photos préchargées | Grille Insta affichée | Sous-picker carrousel |
|---|---|---|
| 0 | Tous les formats | Au clic sur Carrousel : 4 cartes (texte + 3 photo) |
| 1 | Post photo, Reel, Story, Carrousel | Au clic sur Carrousel : 3 cartes photo |
| 2+ | **Carrousel uniquement** | Auto-déroulé : 3 cartes photo |
