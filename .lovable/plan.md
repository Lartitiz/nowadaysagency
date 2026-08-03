# Reels : « Monter la vidéo » devient l'action principale

## Ce qui se passe aujourd'hui

Sur un script de Reel, l'écran de résultat empile : script → bloc « Monter la vidéo » (au milieu, juste après les sections) → plan de tournage → caption → cover → stories → conseil → vérif. Puis, tout en bas, le bouton plein « Publier ou programmer ».

Résultat : l'action qui vient logiquement en premier (monter le clip) est noyée au milieu, et l'action de fin (publier) est la seule qui ressemble à un vrai bouton — alors qu'on ne peut pas publier un reel qui n'existe pas encore.

## Ce qu'on change

1. **Le bloc « Monter la vidéo » descend en fin de fiche**, juste avant les boutons d'action : il devient le dernier pas du parcours, après avoir lu le script, le plan de tournage et la caption.
2. **Il prend l'allure d'un CTA principal** (bouton plein, pas une carte discrète), avec son libellé actuel et le badge beta. Il reste replié tant qu'on ne clique pas — l'ouverture déclenche des appels IA + banque vidéo, on ne les paie pas d'office.
3. **« Publier ou programmer » passe en secondaire** (contour) sur le format Reel tant que la vidéo n'est pas montée, comme c'est déjà le cas pour le carrousel quand Canva est l'action héros. Une fois le MP4 rendu (ou si on referme le montage), il redevient le bouton plein.
4. Une fois le montage ouvert, le panneau s'affiche sur place et peut être replié.

Aucun changement sur les autres formats, ni sur la génération, ni sur le moteur de rendu vidéo.

## Détail technique

- `src/components/creer/formatRenderers/ReelResult.tsx`
  - Déplacer le bloc `montageOpen` (bouton + `<ReelMontage />`) de sa position actuelle (lignes ~114-132) vers la fin du rendu, après `RedFlagsChecker` / `AiGeneratedMention`.
  - Restyler le déclencheur en `Button` pleine largeur (`h-12`, icône `Film`, badge « beta »), avec sous-titre en dessous, et ajouter un lien « Replier le montage » quand il est ouvert.
  - Nouvelle prop optionnelle `onMontageStateChange?: (s: { open: boolean; done: boolean }) => void` pour remonter l'état au parent.
- `src/components/creer/ReelMontage.tsx`
  - Prop optionnelle `onPhaseChange?: (phase: Phase) => void`, appelée dans un `useEffect` sur `phase` — permet de savoir quand la vidéo est rendue (`done`). Aucun autre changement de logique.
- `src/components/creer/CreerStepResult.tsx`
  - État local `reelMontage` alimenté par `onMontageStateChange` ; passer la prop à `<ReelResult />` (ligne 518).
  - Étendre la condition de `variant` du bouton `publish-or-schedule` (lignes 721-726) : `outline` quand `format === "reel" && !reelMontage.done`.
