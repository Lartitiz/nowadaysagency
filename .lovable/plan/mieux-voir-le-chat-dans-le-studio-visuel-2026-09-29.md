# Mieux voir le chat dans le Studio visuel

## Problème constaté
À la taille de fenêtre de Laetitia (~980 px), la colonne de conversation est coincée à ~373 px (38 %) et la poignée de redimensionnement ajoutée récemment est désactivée en dessous de 1000 px. Le chat est donc étriqué et difficile à lire.

## Direction choisie
Prototype « Chat élargi et aéré » (v1), avec les préférences exprimées :
- rendu clean, peu ou pas d'ombres
- texte majoritairement noir (pas de texte rose dans les messages)
- indicateur « génération en cours » conservé et visible

## Changements prévus

### 1. Chat plus large à toutes les tailles d'écran
- La colonne de conversation passe de 38 % à une largeur minimale de ~430 px dès que la fenêtre le permet (au-dessus de 768 px).
- La poignée de redimensionnement (glisser pour élargir/réduire, double-clic pour réinitialiser) devient active à toutes les largeurs au-dessus de 768 px, au lieu d'être masquée sous 1000 px.
- Le réglage choisi reste mémorisé d'une visite à l'autre (comportement existant conservé).

### 2. Lisibilité des messages
- Texte des messages en noir foncé (couleur de texte standard du thème), taille légèrement augmentée (15 px) avec interligne confortable.
- Bulles sans ombres, fonds très clairs, bordures fines — l'accent rose reste réservé aux petits libellés et au bouton d'envoi.
- L'indicateur « génération en cours » reste affiché pendant la création d'image.

### 3. Ce qui ne change pas
- La galerie d'images à droite, le flux de génération, les boutons d'action, le champ de saisie et son contenu.
- La vue mobile (moins de 768 px) conserve son comportement actuel (chat au-dessus de la galerie).

## Détails techniques
- `src/features/visual-studio/studio.css` : media query 1000 px → grille avec colonne chat plus large ; suppression du masquage de la poignée ; styles des messages (couleur texte, taille, suppression d'ombres éventuelles).
- `src/pages/VisualStudioPage.tsx` : le seuil `wide` (matchMedia) passe de 1001 px à 768 px pour activer la poignée et la largeur mémorisée.
- Vérifications : typecheck, build, puis contrôle visuel dans l'aperçu à ~980 px et à 1440 px.
- Frontend non publié (aperçu uniquement).
