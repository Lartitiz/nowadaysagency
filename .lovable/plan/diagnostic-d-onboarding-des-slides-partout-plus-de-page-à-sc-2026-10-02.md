# Diagnostic d'onboarding : des slides partout, plus de page à scroller

## Objectif
Le diagnostic de com' de l'onboarding devient un parcours en slides sur tous les écrans (mobile ET ordinateur). Plus rien à scroller : chaque écran tient au-dessus de la ligne de flottaison, et on avance avec « Suivant », un swipe, ou les flèches du clavier.

## Ce qui change

### 1. Un seul mode slides (DiagnosticView.tsx)
- Le mode slides existe déjà sur mobile (`MobileSlides`) : il devient le mode unique, utilisé aussi sur ordinateur.
- `DesktopScroll` et `AnimatedSection` sont supprimés (plus de page longue à scroller).
- Même contenu, même ordre : accroche → résumé → niveau → points forts → à travailler → priorités → canaux → fiche marque → écran final.

### 2. Navigation claire, impossible à rater
- Bouton « Suivant → » toujours visible en bas (déjà le cas sur mobile).
- Flèches clavier ← / → ajoutées pour l'ordinateur.
- Swipe tactile conservé.
- Pastilles de progression conservées ; l'indication « Swipe ou clique Suivant » devient « Clique Suivant ou utilise les flèches » selon l'écran.

### 3. Tout au-dessus de la ligne de flottaison
- Chaque slide est centrée verticalement dans la hauteur visible.
- Si une slide dépasse (ex. 3 priorités détaillées sur un petit écran), seul le contenu de la slide défile en interne — la page elle-même ne scrolle jamais, les pastilles et le bouton restent fixes en bas.
- Largeur max adaptée à l'ordinateur (un peu plus large que mobile) pour éviter les slides trop étirées.

## Ce qui ne change pas
- Aucun texte, aucune donnée, aucun ordre de section modifiés.
- Niveaux en mots (pas de note) conservés.
- Écran final avec confettis et boutons identiques.
- Mode démo « Léa » : suit automatiquement (mêmes composants).
- Aucun changement serveur, base de données, ou autre écran.

## Technique
- Un seul fichier : `src/components/onboarding/DiagnosticView.tsx`.
- Vérifications : `tsc --noEmit -p tsconfig.app.json`, tests onboarding existants, puis contrôle visuel du diagnostic en desktop et mobile dans l'aperçu.
