# Déplacer le lien d'import site/Instagram sous les photos

## Objectif
Sur la page « Ma bibliothèque » (`/photos`), le lien « Tu n'as rien sous la main ? Récupère celles de ton site ou d'Instagram » s'affiche actuellement dans l'en-tête, au-dessus de la grille de photos, et pousse les photos vers le bas. Il doit passer **en dessous des photos** pour que la grille soit visible directement.

## Modification (1 fichier : `src/pages/PhotosPage.tsx`)
1. Supprimer le bloc `<p>` (lignes 322-332) de l'en-tête, entre les boutons « Ajouter des photos / Studio visuel » et l'onglet des vues.
2. Réinsérer le même bloc (texte, bouton, classes et comportement `setSiteImportOpen(true)` inchangés) à la fin de la vue « Mes photos », juste après le bloc « Afficher les photos plus anciennes », à l'intérieur du fragment `view === "photos"`.

Le lien reste donc visible sur la vue « Mes photos » (là où il est utile) ; les vues « Mes préparations » et « Photos à prendre » ne sont pas touchées. Aucun style, texte ni comportement modifié — uniquement un déplacement.

## Vérifications
- Compilation : `npx tsc --noEmit -p tsconfig.app.json`.
- Aperçu Playwright avec session connectée : le lien n'est plus dans l'en-tête, la grille de photos commence directement sous les onglets, et le lien apparaît sous la grille ; un clic ouvre toujours la fenêtre d'import site/Instagram.
- Frontend non publié (pas de publication sans demande explicite).
