# Étape « Ton premier contenu » : remettre l'essentiel en haut

## Le problème

Sur l'étape 3 (carrousel), deux réglages techniques — « Mode qualité Max » et « Illustration de couverture » — s'affichent AVANT le contenu principal. On lit donc deux paragraphes d'options avant même de voir son idée et le bouton de génération.

## Ce qu'on change

Nouvel ordre de lecture :

1. Le bloc principal : « Ton premier contenu est prêt à écrire », l'idée préparée, le bouton « Générer mon premier contenu », puis le lien « Je préfère répondre à quelques questions d'abord ».
2. Sous le bouton, une ligne discrète repliée : « ⚙️ Options avancées » (ou « Affiner la qualité »), fermée par défaut.
3. À l'ouverture : les deux réglages actuels (Mode qualité Max, Illustration de couverture), inchangés dans leur fonctionnement, leurs badges Premium et leurs liens d'upgrade.

Détails visuels :
- Les deux options passent d'encarts pleine largeur à des lignes plus compactes à l'intérieur du panneau replié (titre + switch sur une ligne, description en petit dessous).
- Quand une option est activée, un petit indicateur reste visible sur la ligne repliée (ex. « Options avancées · Qualité Max ») pour qu'on n'oublie pas un réglage actif.
- Rien ne change pour les autres étapes ni pour les autres formats : ces options ne s'affichent toujours que sur le format carrousel.

## Détails techniques

- `src/pages/CreerUnifie.tsx` : les deux blocs `<label>` (lignes ~3840-3912) sont extraits dans un nouveau composant `src/components/creer/CarouselAdvancedOptions.tsx` recevant `qualityMax`, `setQualityMax`, `qualityMaxLocked`, `coverIllustration`, `setCoverIllustration`, `coverIllustrationLocked`.
- Ce composant est rendu APRÈS `<CreerStepQuestions />` (toujours conditionné à `step === "questions" && selectedFormat === "carousel"`), dans un `Collapsible` shadcn fermé par défaut.
- Aucun changement de logique de génération : les états et leur usage dans le payload restent identiques.
