# Supprimer « Créer un avant/après ou un mockup » de Ma bibliothèque

## Objectif
Retirer le lien « Créer un avant/après ou un mockup » de la page Ma bibliothèque (`/photos`), comme demandé : la même fonctionnalité est déjà accessible directement dans le Studio visuel, qui possède ses propres fenêtres avant/après et mockup.

## État actuel vérifié
- Le lien est le seul point d'entrée de la page vers les fenêtres « Avant/après » et « Mockup » (état `createVisualOpen`, lignes 329-331).
- Le Studio visuel (`src/pages/VisualStudioPage.tsx`) ouvre déjà `OfferMockupDialog` et `AvantApresDialog` par ses propres moyens — aucune dépendance vers la page bibliothèque.
- Les tests existants ne vérifient pas ce lien (ils se contentent de simuler la fenêtre).

## Modifications — un seul fichier : `src/pages/PhotosPage.tsx`
1. Supprimer le lien « Créer un avant/après ou un mockup » (lignes 329-331).
2. Supprimer le code devenu inaccessible sur cette page :
   - états `createVisualOpen`, `mockupOpen`, `avantApresOpen` ;
   - usage de `CreateVisualDialog`, `OfferMockupDialog`, `AvantApresDialog` ;
   - imports correspondants devenus inutiles.
3. Ne rien toucher d'autre : « Ajouter des photos », « Studio visuel », l'import site/Instagram, les fiches photo et les autres fenêtres restent inchangés.

## Hors périmètre
- Aucune modification du Studio visuel, des composants partagés (`CreateVisualDialog.tsx`, `AvantApresDialog.tsx`, `OfferMockupDialog.tsx` restent en place pour le Studio), aucune donnée, aucun déploiement de fonction.
- Frontend non publié sans demande explicite.

## Vérifications
- `npx tsc --noEmit -p tsconfig.app.json`
- Tests concernés : `npx vitest run src/test/photos-library-ux.test.tsx src/test/audit-photo-library-error.test.tsx`
- Contrôle visuel dans l'aperçu avec session restaurée : le lien a disparu, le reste de l'en-tête est intact.
