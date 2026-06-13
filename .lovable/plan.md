## Objectif

Dans le dialog d'édition d'un post du calendrier :
1. Isoler visuellement le bloc **Statut** (et la **Date**) en haut, séparé du reste des métadonnées (canal, format, etc.).
2. Remplacer la petite icône ↩︎ "Remettre en idée" (peu lisible) par un **bouton texte explicite** : "💡 Je veux le remettre dans mes idées", placé directement sous le Statut.

Comportement du bouton : exactement celui déjà câblé via `handleUnplan` dans `src/pages/Calendar.tsx` (lignes 643-672) — création d'une ligne dans `saved_ideas` + suppression du `calendar_posts` + refresh sidebar + toast. **Aucune modif de la logique métier**, juste de l'UI.

## Fichiers impactés

- `src/components/calendar/CalendarPostMetadata.tsx`
  - Couper le composant en deux blocs visuels :
    - **Bloc 1 (statut + date)** : encadré léger (carte avec `border border-border rounded-[12px] p-3 space-y-3`) pour le détacher.
    - **Bloc 2** : le reste (Série, résumé Canal/Format, Collapsible avancé) reste inchangé, juste séparé par un petit espacement.
  - Ajouter dans le bloc 1, juste sous le Statut, un bouton plein largeur : `💡 Je veux le remettre dans mes idées`. Ce bouton appelle une nouvelle prop optionnelle `onUnplan?: () => void` et ne s'affiche que si `onUnplan && editingPostId`.
  - Confirmation native avant l'action : `window.confirm("Remettre ce post dans ta boîte à idées ? Il sera retiré du calendrier.")`.

- `src/components/calendar/CalendarPostDialog.tsx`
  - Passer la prop `onUnplan={onUnplan}` à `<CalendarPostMetadata />`.
  - **Supprimer** le bouton icône ↩︎ Undo2 du `actionsBlock` (lignes 406-410), il fait désormais doublon.
  - Garder le bouton 💾 Enregistrer et le bouton 🗑️ Supprimer.
  - Retirer l'import `Undo2` si plus utilisé.

- `src/pages/Calendar.tsx`
  - **Aucun changement** — `handleUnplan` reste tel quel, déjà passé via `onUnplan`.

## Critères de validation

- `npx tsc --noEmit --skipLibCheck` passe.
- Sur mobile et desktop, le Statut + Date apparaissent dans une carte dédiée en haut du panneau Méta, avec le bouton "Je veux le remettre dans mes idées" juste dessous.
- Cliquer ce bouton → confirmation → post disparaît du calendrier, réapparaît dans la sidebar Idées, toast "Remis en idée !".
- Plus aucun bouton icône ↩︎ dans la barre d'actions du bas (juste 💾 Enregistrer + 🗑️ Supprimer).
- Création d'un nouveau post (pas d'`editingPost`) : le bouton n'apparaît pas (cohérent — rien à "remettre").

## Hors scope

- Changement de la requête `handleUnplan` (déjà OK).
- Refonte du drag-and-drop vers la sidebar idées (déjà fonctionnel).
- Animations de transition.
