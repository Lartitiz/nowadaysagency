## Contexte
Dans la page `/creer` (composant `CreerStepIdea.tsx`), le bouton **"Pas d'idée ? Laisse-toi guider"** est actuellement un simple lien texte sous le textarea. Les trois autres options de création (Photos, Actu, Transformer) sont des cartes visuelles dans une grille. L'utilisateur veut que le coaching rejoigne cette grille pour unifier le visuel.

## Changements

### 1. Retirer le bouton texte actuel
Supprimer le `<button>` "Pas d'idée ? Laisse-toi guider" situé sous le textarea (lignes ~104-110). Le paragraphe explicatif "Pas besoin d'être précise" reste en place.

### 2. Ajouter une carte coaching dans la grille
Dans la grille `sm:grid-cols-3 gap-2` (lignes ~132-168) qui contient les 3 options alternatives, ajouter une quatrième carte identique en style :
- Icône `HelpCircle` (primary)
- Titre : "Pas d'idée ?"
- Sous-titre : "Laisse-toi guider par la coach."
- Même classes CSS (rounded-xl, border, bg-card, hover states, p-3)
- Au clic : ouvre le même `ContentCoachingDialog` via `setCoachOpen(true)`

### 3. Adapter la grille
Passer la grille de 3 à 4 colonnes sur desktop (`sm:grid-cols-4`) ou laisser en `sm:grid-cols-2` si 4 cartes passent mieux sur 2 lignes. À valider visuellement — comportement par défaut : `grid-cols-2` sur sm et au-dessus si 4 éléments.

## Non-modifié
- Le `ContentCoachingDialog` et son état `coachOpen`
- Le textarea, le CTA principal, les autres modes (Photos, Newsjacking, Transform)
- La logique des props `onCoachingSelect`