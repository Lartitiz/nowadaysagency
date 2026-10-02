# Studio photo — refonte Apple minimal (direction « onglets centrés »)

## Objectif
Rendre l'écran Studio photo (`/photos/studio`) clean et simple façon Apple : fond blanc, gris neutres, accent bordeaux, onglets centrés. Aucune fonctionnalité ne change.

## Choix validés
- Direction : « Apple minimal — onglets centrés » (maquette v1 choisie)
- Fond blanc pur, surfaces gris très clair, texte presque noir
- Accent bordeaux #91014b (onglet actif, bouton Envoyer, sélections)
- Typographies inchangées : Libre Baskerville (titres), IBM Plex Sans (corps)
- Structure deux panneaux conservée : conversation à gauche, images à droite

## Changements

### 1. `src/features/visual-studio/studio.css` — surcharge de thème locale
Les tokens sémantiques sont surchargés **uniquement dans `.studio-page`** (le reste de l'app garde le thème framboise global) :
- `--background` : blanc pur
- `--muted` : gris Apple très clair (bulles, fonds de champs)
- `--muted-foreground` : gris moyen neutre
- `--border` : gris clair neutre (fini les bordures rosées)
- `--primary` : bordeaux #91014b (onglet actif, sélections, focus)

### 2. En-tête — onglets centrés
- `.studio-header` passe en grille 3 colonnes : retour « Bibliothèque » + titre à gauche, onglets Photos / Clips vidéo centrés, « Mes sessions » à droite
- Onglets : espacement plus large, souligné bordeaux sur l'actif, survol discret
- Petit ajustement JSX dans `src/pages/VisualStudioPage.tsx` : la nav d'onglets sort du groupe de gauche pour être centrée

### 3. Détails d'épurage (CSS uniquement)
- Zone images : fond blanc (au lieu du gris rosé)
- Bulles de conversation : gris neutre ; mes messages : teinte bordeaux très légère
- État vide : icône dans un carré gris arrondi, sans bordure pointillée rosée
- Ombres et rayons adoucis, transitions discrètes

## Hors périmètre
- Aucun changement de fonctionnalité, de texte, de logique ou de backend
- L'en-tête global de l'app (logo, navigation) et le reste du site restent au thème actuel
- Mobile : la structure actuelle (conversation puis images empilées) est conservée, avec les mêmes couleurs épurées

## Vérification
- Typage `tsc --noEmit -p tsconfig.app.json` + tests existants
- Capture d'écran du Studio dans l'aperçu pour contrôle visuel du rendu
