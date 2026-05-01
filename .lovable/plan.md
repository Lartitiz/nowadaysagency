## Contexte

Quand l'utilisateur entre par "Partir de photos" (`initialPhotos.length > 0`), l'écran Format propose actuellement **tous les formats**, y compris ceux qui ne savent pas exploiter les photos (carrousel texte, pinterest texte, etc.). On affiche juste un avertissement amber a posteriori. Décision : masquer complètement les formats incompatibles dans ce mode.

## Inventaire (in/out)

**Compatibles photos** (gardés) :

| Canal | Formats |
|---|---|
| Instagram | post, reel, story, carousel (sous-modes photo/mix forcés) |
| LinkedIn | post texte (avec image), carrousel mixte |
| Pinterest | visuel, inspiration |
| Newsletter | newsletter (image d'en-tête) |

**Incompatibles** (masqués si photos préchargées) :

- LinkedIn → carrousel **texte**
- Pinterest → **texte** (SEO seul)
- Carrousel Instagram → sous-mode **texte**

**Canaux** : tous conservés (chacun a au moins un format compatible). Filtrer au niveau canal ferait perdre des cas légitimes (ex : post LinkedIn avec photo de chantier).

## Implémentation

Tout se passe dans `src/components/creer/CreerStepFormat.tsx`. On dérive un booléen `hasPreloadedPhotos = (initialPhotos?.length ?? 0) > 0` en haut du composant.

### 1. Sous-grille Instagram (lignes 419-451)

Filtrer la liste : si `hasPreloadedPhotos`, ne montrer que les formats dont `formatAcceptsSinglePhoto(id)` est vrai **ou** `id === "carousel"`.

### 2. Sous-mode LinkedIn (lignes 353-383)

Si `hasPreloadedPhotos`, masquer la carte "Carrousel texte" (garder "Post texte" et "Carrousel mixte").

### 3. Sous-mode Pinterest (lignes 386-416)

Si `hasPreloadedPhotos`, masquer la carte "Texte" (garder "Visuel" et "Inspiration").

### 4. Sous-mode carrousel Instagram (lignes 538-567)

Si `hasPreloadedPhotos`, masquer la carte "📝 Texte" du choix de sous-mode carrousel (ne montrer que Photo et Mixte). Idéalement, pré-sélectionner Mixte par défaut comme sous-mode.

### 5. Avertissement amber existant (lignes 456-470)

Devient quasi inatteignable une fois le filtre appliqué — on le garde tel quel comme garde-fou (ex : preload async).

### 6. Hint discret en haut

Sous le titre "Quel format ?", ajouter une petite note : *"Quelques formats ont été masqués car ils n'utilisent pas tes photos."* + lien *"Tout afficher quand même"* qui force `hasPreloadedPhotos = false` localement (état `forceShowAll`). Filet de sécurité pour les cas où l'utilisateur veut un texte pur malgré ses photos.

## Hors scope

- Pas de changement dans `CreerStepIdea.tsx` (entrée).
- Pas de changement dans `use-content-generator.ts` ni dans la logique de génération.
- Le warning ref preexistant `Function components cannot be given refs` reste à traiter ailleurs.

## Validation

- Entrer par "Partir de photos", uploader 3 photos, Suivant → écran Format.
- Instagram : la grille ne montre que post/reel/story/carrousel.
- LinkedIn : 2 cartes (Post texte, Carrousel mixte).
- Pinterest : 2 cartes (Visuel, Inspiration).
- Carrousel Instagram : sous-modes Photo + Mixte uniquement.
- Cliquer "Tout afficher quand même" → tous les formats reviennent, l'avertissement amber s'affiche si on choisit un format texte.
- Entrer sans photos → tout est affiché normalement (régression check).