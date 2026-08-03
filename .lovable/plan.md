# Reel : un parcours en 4 étapes au lieu d'une page fleuve

## Le constat

Aujourd'hui, quand un script de Reel est généré, tout arrive d'un bloc sur un seul écran : lecture face cam, sections du script, bloc « Monter la vidéo » (au milieu), plan de tournage, caption, hashtags, cover, stories d'amplification, conseil, vérif anti red-flags, puis « Publier ou programmer ».

Deux problèmes : on ne sait pas par où commencer, et l'ordre ne suit pas la réalité (on ne peut pas publier une vidéo qui n'est pas encore montée).

## Le nouveau parcours

Le résultat Reel devient un mini-parcours en 4 étapes, avec une barre de progression en haut (même style que le stepper de /creer) et un seul bouton d'avancement en bas de chaque étape. On peut revenir en arrière à tout moment en cliquant sur une étape passée.

**Étape 1 — Mon script**
Lecture face cam + les sections (timing, texte parlé, overlay, cut, tips) + la vérif anti red-flags sur le texte.
→ bouton : « Passer au tournage »

**Étape 2 — Mon tournage**
Le plan de tournage (shot list) et le conseil personnalisé. Si le script n'a pas de plan de tournage, cette étape est sautée automatiquement.
→ bouton : « Monter ma vidéo »

**Étape 3 — Le montage**
Le panneau de montage actuel (clips, voix, sous-titres, rendu MP4). Il ne se charge qu'à l'arrivée sur cette étape, donc aucun appel IA / banque vidéo tant qu'on n'y est pas.
→ bouton : « Ma légende » (et une fois le MP4 rendu, le bouton devient l'action principale)
→ lien discret : « Je monte plus tard » pour filer à l'étape 4

**Étape 4 — Légende et publication**
Caption + hashtags + texte de cover + stories d'amplification. C'est ici, et seulement ici, qu'apparaît « Publier ou programmer ».

Le menu « Autres actions » (copier, télécharger, ranger) reste accessible en bas quelle que soit l'étape.

## Détail technique

- Nouveau composant `src/components/creer/formatRenderers/ReelSteps.tsx` : possède l'état `step` (1-4), affiche un stepper réutilisant le pattern de `CreerStepper.tsx` (étapes passées cliquables), calcule les étapes disponibles (étape 2 masquée si `plan_tournage` vide) et rend le contenu de l'étape courante.
- `src/components/creer/formatRenderers/ReelResult.tsx` : découpé en 4 sous-blocs de présentation (`ScriptStep`, `TournageStep`, `MontageStep`, `CaptionStep`) dans le même fichier, consommés par `ReelSteps`. Aucun changement des champs lus dans `result`.
  - `ReelMontage` n'est monté que quand `step === 3` (comportement « lazy » actuel conservé, le clic devient l'arrivée sur l'étape).
  - Nouvelle prop `onStepChange?: (s: { step: number; isLast: boolean; montageDone: boolean }) => void`.
- `src/components/creer/ReelMontage.tsx` : prop optionnelle `onPhaseChange?: (phase: Phase) => void` appelée dans un `useEffect` sur `phase`, pour savoir quand le MP4 est prêt. Aucune autre modification de logique.
- `src/components/creer/CreerStepResult.tsx` :
  - état local `reelStep` alimenté par `onStepChange`, passé à `<ReelResult />` (ligne 518).
  - le bouton `publish-or-schedule` (lignes 717-731) n'est rendu, pour `format === "reel"`, que si `reelStep.isLast`. Les autres formats sont inchangés.
  - `AiGeneratedMention` et `Autres actions` restent où ils sont.
- Tests : `src/test/reel-result.test.tsx` sera ajusté (il mocke déjà `ReelMontage` pour éviter les appels réseau) pour vérifier que l'étape 1 s'affiche par défaut et que le montage n'est pas monté avant l'étape 3.

Aucun changement de route, de schéma, d'edge function ou de prompt.
