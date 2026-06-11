# Plan — Toggle "J'attache une photo" cassé sur post et reel

## Problème

Sur les formats Post Instagram, Reel, Story, LinkedIn et Newsletter, cliquer sur le toggle "📸 J'attache une photo…" devrait afficher la zone d'upload juste en dessous. Rien n'apparaît actuellement, donc l'utilisateur n'a aucun moyen d'attacher sa photo.

## Cause

Dans `src/components/creer/CreerStepFormat.tsx` (ligne 541), le toggle est un `<button>` qui contient un `<Switch>` shadcn — lui-même rendu par Radix comme un `<button>`. HTML interdit les boutons imbriqués : le navigateur peut sortir le `<button>` interne du `<button>` parent, ce qui casse la propagation du `onClick` extérieur. Résultat : `setPhotoMode(true)` n'est pas appelé de façon fiable, donc la `PhotoUploadZone` (conditionnée sur `photoMode`) ne monte pas.

## Correctif

Remplacer le `<button>` extérieur par un `<div role="button" tabIndex={0}>` accessible :
- mêmes classes Tailwind et style visuel
- `onClick={() => setPhotoMode(!photoMode)}`
- handler `onKeyDown` pour Enter et Space
- `aria-pressed={photoMode}` conservé
- le `<Switch>` interne garde son `pointer-events-none` — un seul handler (le wrapper) déclenche le toggle, pas de double bascule

Aucun changement sur les libellés, les copies (`getPhotoToggleCopy`), la logique d'auto-activation quand une photo est preloadée, ou la `PhotoUploadZone` rendue au-dessous.

## Validation

- Sélectionner Post Instagram → cliquer sur le toggle → la zone d'upload apparaît immédiatement.
- Idem pour Reel, Story, LinkedIn, Newsletter.
- Re-cliquer → toggle se désactive, la zone disparaît.
- Navigation clavier : focus + Enter/Space toggle l'état.

## Hors scope

- Pas de changement sur la génération en aval.
- Pas de retouche des copies du toggle.
- Pas de changement sur le carrousel (le sous-picker carrousel ne souffre pas du problème : il n'a pas de Switch).
