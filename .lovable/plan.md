# Thème / sujet : voir le texte en entier quand il est long

## Le problème

Le champ « Thème / sujet » du post du calendrier est un champ d'une seule ligne. Dès que le sujet est un peu long, la fin du texte sort du cadre : on ne lit que le début (ou que la fin quand le curseur est au bout), et il faut faire défiler horizontalement dans le champ pour relire ce qu'on a écrit.

## Ce qu'on change

Le champ devient une zone de texte qui s'agrandit toute seule :

- Elle démarre sur une ligne (même hauteur qu'aujourd'hui, même style arrondi).
- Dès que le texte dépasse, elle passe sur deux, puis trois lignes, jusqu'à afficher le sujet en entier.
- Au-delà de quatre lignes environ, elle arrête de grandir et devient scrollable, pour ne pas pousser le reste du formulaire hors de l'écran.
- Entrée n'ajoute pas de retour à la ligne : un sujet reste une seule phrase.

Le reste ne bouge pas : même libellé, même placeholder « De quoi parle ce post ? », même enregistrement automatique.

## Détails techniques

- `src/components/calendar/CalendarPostDialog.tsx` (ligne ~589) : remplacer le `<Input>` du thème par un `<textarea>` `rows={1}` avec `resize-none`, `overflow-hidden`, `max-h-[7rem]` et les mêmes classes visuelles que l'Input (bordure, `rounded-[10px]`, padding, focus ring).
- Auto-grow via un `ref` + effet : `el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, maxPx) + "px"` à chaque changement de `theme` et à l'ouverture du dialogue (pour un post existant au sujet déjà long).
- `onKeyDown` : `if (e.key === "Enter") e.preventDefault()`.
- `autoFocus` conservé ; aucun changement de state, de `buildSaveData` ni de l'auto-save.
