# Plan — Affichage centré et plus lisible des idées sauvegardées

## Problèmes identifiés

1. Le panneau de détail s'ouvre en `Sheet` latéral droit, étroit (`sm:max-w-[420px]`) — peu confortable pour lire un brief avec plusieurs champs.
2. Pour les idées de type "data libre" (newsjacking : `axe`, `ton`, `titre`, `resume`, `source`, `pertinence`), le composant `FallbackPreview` aligne les labels en `text-xs` inline sans hiérarchie, ce qui produit l'effet de collage visible dans la sélection (`axe :debat_recurrentton :entre_deux…`).

## Changements

### 1. `src/pages/IdeasPage.tsx` — Sheet → Dialog centré
- Remplacer l'import `Sheet*` par `Dialog*`.
- Remplacer `<Sheet>` / `<SheetContent>` / `<SheetHeader>` / `<SheetTitle>` / `<SheetDescription>` par leurs équivalents Dialog.
- `DialogContent` : largeur confortable (`max-w-2xl`), hauteur bornée (`max-h-[90vh]`), scroll interne (`overflow-y-auto`), padding généreux. Centré par défaut.
- Conserver tout le contenu interne tel quel (badges statut/objectif/canal/type, sections Angle/Format, Accroche, Contenu, Dates, Notes, Actions).

### 2. `src/components/ContentPreview.tsx` — `FallbackPreview` plus clair
- Garder la même API (props et `onContentChange`).
- Pour chaque entrée :
  - Label en `text-[11px] font-mono-ui uppercase tracking-wide text-muted-foreground` au-dessus de la valeur (et non collé inline).
  - Valeur en `text-sm text-foreground leading-relaxed` sur sa propre ligne.
  - Bloc séparé par un `space-y-3` global et un `border-t border-border/40 pt-3` entre items (sauf le premier) pour aérer visuellement.
- Mise en avant prioritaire : si la clé est `titre` ou `title`, l'afficher en `text-base font-semibold` sans label, en premier. Si `axe` et/ou `ton` existent, les afficher juste en dessous sous forme de petits chips `rounded-pill bg-muted px-2 py-0.5 text-[10px]`.
- Conserver la limite `slice(0, 10)` et le filtre `length > 5`.
- Conserver l'édition inline (`EditableText`).

## Hors scope
- Pas de refonte des autres previews (Reel, Stories, Carousel, Post).
- Pas de changement de logique de sauvegarde, statuts, actions, notes.
- Pas de changement de couleurs / tokens globaux.

## Validation
- `npx tsc --noEmit --skipLibCheck` propre.
- Visuel : ouvrir une idée newsjacking → modale centrée, titre en avant, axe/ton en chips, résumé/source/pertinence en sections lisibles.
- Régression : ouvrir une idée carrousel / reel / post → preview existante intacte.
