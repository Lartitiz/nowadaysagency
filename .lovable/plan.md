# Glisser-déposer des photos dans Ma bibliothèque

## Ce que tu pourras faire

Prendre une ou plusieurs images depuis ton ordinateur et les lâcher directement sur la page Ma bibliothèque, sans passer par le bouton « Ajouter des photos ».

- Pendant que tu survoles la page avec des fichiers, un cadre rose en pointillés apparaît autour de la zone des photos avec le message « Lâche tes photos ici ».
- Au lâcher, l'envoi démarre exactement comme avec le bouton : mêmes limites (nombre max par lot, formats acceptés), mêmes vignettes « en cours », mêmes messages de réussite ou d'erreur, description automatique lancée après.
- Ça marche aussi bien quand la bibliothèque est vide (sur l'écran d'accueil « aucune photo ») que quand elle est déjà pleine.
- Les fichiers non images sont ignorés avec le message habituel.
- Rien ne se déclenche tant que l'espace de travail n'est pas prêt ou si un envoi est déjà en cours.

## Détails techniques

Dans `src/pages/PhotosPage.tsx` :

- Ajouter un état `dragActive` et des gestionnaires `onDragEnter` / `onDragOver` / `onDragLeave` / `onDrop` sur le conteneur `<main id="main-content">`.
- Utiliser un compteur de profondeur (dragenter/dragleave s'empilent sur les enfants) pour éviter le clignotement du cadre.
- `onDrop` : `e.preventDefault()`, réinitialiser l'état, puis appeler la fonction existante `handleFilesSelected(e.dataTransfer.files)` — aucune nouvelle logique d'envoi, donc quotas, filtres de format, `MAX_BATCH`, toasts et `setView("photos")` restent identiques.
- Ne rien faire si `!wsReady || uploading`.
- Superposition visuelle : élément absolu à l'intérieur du `main` (relatif), bordure pointillée `border-primary`, fond translucide, `pointer-events-none`, coins arrondis conformes au style de l'app (rectangles arrondis, pas de cercle).
- Accessibilité : la superposition est décorative (`aria-hidden`) ; le bouton « Ajouter des photos » reste le chemin clavier.

## Vérifications

- `npx tsc --noEmit -p tsconfig.app.json`
- Test unitaire ajouté : un `drop` avec deux fichiers image appelle bien la logique d'envoi existante ; un `drop` pendant un envoi en cours ne fait rien.
- Contrôle dans l'aperçu (session connectée) : le cadre apparaît au survol avec fichiers et disparaît au lâcher.

Le frontend ne sera pas publié.
