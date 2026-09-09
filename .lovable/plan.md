# Retrouver ses briefs enregistrés dans la Boîte à idées

## Le constat

Quand une personne commence un contenu en répondant aux questions du flux "Créer", ses réponses sont enregistrées comme brief. Avant la refonte de la page "Mes idées", ces briefs s'affichaient dans la liste avec un bouton pour reprendre là où elle s'était arrêtée.

Aujourd'hui ils sont toujours enregistrés dans la base, mais plus affichés nulle part : ils sont invisibles et impossibles à reprendre. Seuls ceux déjà rattachés à un post du calendrier restent consultables.

## Ce qu'on remet en place

1. **Affichage des briefs dans "Mes idées"**
   - Charger les briefs de la personne (hors briefs déjà rattachés à un post du calendrier, pour éviter les doublons).
   - Les afficher dans la même liste que les idées, avec une pastille "Brief en cours" pour les distinguer, format et date visibles.
   - Les inclure dans la recherche et dans le filtre par format existants.

2. **Reprendre un brief**
   - Bouton "Reprendre ce brief" : renvoie vers le flux "Créer" avec les questions et les réponses déjà remplies (même mécanisme qu'avant, déjà présent côté "Créer").

3. **Supprimer un brief**
   - Le bouton supprimer de la carte gère aussi les briefs.

## Détails techniques

- `src/pages/IdeasPage.tsx` : re-fetch de `content_briefs` via `useWorkspaceFilter`, état `briefs`, fusion avec les idées dans la liste triée par date, branche `type === "brief"` dans le rendu de carte, `handleCreateFromBrief` naviguant vers `/creer` avec `{ state: { fromBrief: true, questions, answers, briefId } }`, et branche brief dans `handleDelete`.
- Le consommateur du payload existe déjà (`locState.fromBrief`, `CreerUnifie.tsx:777`) — rien à changer côté "Créer".
- Pas de changement de base de données.
