# Chantier robustesse : état et suite

Mémoire du chantier « rendre l'outil robuste face au vibe coding », pour que la
prochaine session reparte sans tout ré-expliquer. Mis à jour le 14/10/2026.
Détail technique de la création de contenu : `docs/creation-contenu/CARTE.md`.

## Constat de départ (14/10/2026)
- Lovable pousse directement en production : environ 580 commits sur `main` en
  un mois ; les tests ne tournent qu'après ; 88 CI rouges sur `main` au total.
- Les régressions viennent surtout des gros fichiers « fourre-tout » :
  CarouselEditor.tsx (3 816 lignes), CreerUnifie.tsx (3 587), carousel-ai et
  carousel-visual (environ 2 800 chacun), VisualStudioPage (2 059).

## Fait et fusionné
| Lot | PR | Contenu |
|---|---|---|
| 1 à 5 | #1461 | Carte de la création, tests par format, creative-flow découpé par format, garde-fous CI, suivi Sentry par format |
| Bugs | #1463 | Questions sans angle, `calendar_id` lu par /creer, date dans « Approfondir » |
| 6 | #1466 | Ne jamais perdre une modification (copie avant Régénérer, frappe de « Modifier » sauvegardée, Retour protégé) |
| 7 | #1468 | Une seule version du texte modifié (carrousel et stories remis dans la structure, « Ajuster » par format, pas de débit sur réponse vide) |
| E1 | #1469 | Contrat des étiquettes `data-*` serveur → éditeur visuel → export, testé |
| 9 | #1472 | Rapport d'impact élargi, frontière texte / design par fonction (`_shared/design-text-boundaries_test.ts`), contrat `ai-text-action` |
| 8 | #1475 | Carrousel : choix de design de `carousel-ai` isolés dans `carousel-ai/layout.ts` (sortie identique, figée par `carousel-ai/handler_contract_test.ts`) ; frontière design / écriture par module (`_shared/carousel-design-boundaries_test.ts`) ; libellé du bouton d'appel à l'action rangé dans la slide (`cta_label`). Fusionnée le 14/10/2026 |
| E2 | #1476 | Éditeur visuel figé par 6 fichiers de tests `src/test/carousel-editor-*.test.tsx` (poignées et magnétisme, réglages avancés, photo glissée, annuler après opération lourde, aller-retour avec `mergeEditorRaw`, étiquettes d'export). Aucun code de l'éditeur modifié |
| E2 bis | #1477 | Corrige les 2 bugs trouvés par E2 : un bloc tourné ne saute plus de largeur quand on tire sa poignée ; « Police et couleur sur toutes les slides » ne touche plus les slides verrouillées. Fusionnée le 14/10/2026 |

## Lancés en conversations séparées (cartes du 14/10/2026)
1. Cartographier les gros fichiers et poser un cliquet anti-dette (G1).
2. Figer l'éditeur visuel par des tests (E2).
3. Borner la relance automatique des visuels (crédits consommés en arrière-plan, à confirmer).
4. Étendre les garde-fous au design et à l'édition (lot 9).
5. Poser les petits verrous de la création (lot 10).
6. Finir de séparer texte et design du carrousel (lot 8).

## Lot 8b (14/10/2026)
- Fait : les 18 parcours de `carousel-ai` sont figés par `carousel-ai/handler_contract_test.ts` (structure proposée, sujets, angles, questions, récit continu photo / mixte ajoutés) ; la mise en forme du récit continu (gabarits, style du texte sur photo, disposition du mixte, mot de couverture `cover_accent`) passe par `carousel-ai/layout.ts`, sortie identique ; `CARROUSEL_AI_AUTORISES` est vide.
- Décision de Laetitia du 14/10/2026 : le mot de couverture reste proposé par l'IA dans l'appel d'écriture (aucun changement de prompt ni de crédits) ; seule sa validation est dans `layout.ts`.
- Fait après la fusion de #1470 : carrousel texte, le libellé du bouton est rangé dans la slide (`cta_label`) dès l'arrivée des visuels (`src/lib/carousel-cta-label.ts`, appelé par `onCtaLabels` de `use-generate-visuals.ts`), sans changer le rendu ; une slide texte n'envoie toujours pas `cta_label` à `carousel-visual`. Le lot 8 est terminé.

## Découpage de CreerUnifie.tsx (fiche 1 de `docs/robustesse/gros-fichiers.md`)
- **Lot A** (#1482, fusionné le 14/10/2026) : tests 1 à 11 en rendu réel (`src/test/creer-entrees-calendrier-brief`,
  `creer-reprise-modifier-reset`, `creer-publication-exports`, `creer-angles-reel-photos`).
  Corrige aussi 3 bugs qu'ils ont révélés (décision de Laetitia du 14/10/2026) : vidéo
  du reel perdue au rechargement, sujet vide en ouvrant l'atelier depuis le calendrier
  (`theme`), « 1 photo n'ont ». Le PPTX texte avec visuels périmés n'est pas un bug
  (il ignore les visuels).
- **Lot B** (#1496, fusionné le 14/10/2026) : `LowCreditsBanner`, la fenêtre « photos manquantes » et
  « Repartir de zéro ? » sortis à l'identique dans `src/components/creer/LowCreditsBanner.tsx`,
  `PhotoMissingDialog.tsx`, `ConfirmResetDialog.tsx` (affichage pur ; état et actions
  restent dans la page). Rangés dans « Parcours /creer » du rapport d'impact.
  Fenêtre « photos manquantes » testée sur la vraie page /creer par
  `src/test/creer-photos-manquantes.test.tsx` (#1505, fusionné le 14/10/2026).
- **Lot C** (#1508, fusionné le 14/10/2026) : fonctions sorties à l'identique dans `src/features/creer/` :
  `creer-step.ts` (`Step`, `resolveSafeStep`, `FORMAT_MAP`, `SUPPORTED_FORMATS`,
  `ONE_SHOT_PARAMS`), `draft-conflict.ts`, `pending-stream.ts`,
  `edit-text-from-result.ts`, `content-brief.ts` (écrit en base : deux fonctions
  simples, pas de hook, filtre workspace gardé tel quel, décision de Laetitia du
  14/10/2026). Le nombre de photos est passé en argument au lieu de `loadPhotos()`.
  Une seule PR pour les cinq. Aucun test modifié.
- **Lot D** (#1538, fusionné le 14/10/2026) : les 8 exports + `useOpenInCanva` sortis à l'identique
  dans `src/hooks/use-creer-exports.ts` (un seul hook, 11 paramètres, décision de
  Laetitia du 14/10/2026). Appelé à la place des exports, même ordre des hooks ;
  `demoToast` et `effectiveHandle…` restent dans la page. Code comparé par script
  à l'original. Aucun test modifié. Écart avec la fiche : en démo, seuls les 4
  exports du carrousel passent par `demoToast` ; les 3 exports Pinterest restent
  actifs (inchangé).
- **Lot E** (#1545, fusionné le 14/10/2026) : séquence de lancement sortie à l'identique dans
  `src/hooks/use-launch-sequence.ts` (états + génération des 5 chapitres) et
  `src/components/creer/LaunchSequenceResults.tsx` (attente puis onglets). Écart avec
  la fiche (décision de Laetitia du 14/10/2026) : les états sont lus tôt par la
  sauvegarde `CREER_RESULT_KEY` alors que `generate` n'existe que plus bas ; le hook
  est donc appelé à la place des anciens états et reçoit `generate`, le sujet et
  l'objectif au lancement. Aucun test ne couvrait la séquence : test en rendu réel
  ajouté d'abord (`src/test/creer-sequence-lancement.test.tsx`, 5 cas, vérifié sur
  l'ancien code et contre deux pannes volontaires). Aucun test existant modifié.
- **Lot F** (#1552, fusionné le 14/10/2026) : angles d'attaque du reel sortis à l'identique dans
  `src/hooks/use-reel-hooks.ts` (états, `fetchReelHooks`, `handleHookSelect`,
  `handleHookSkip`). Même solution qu'au lot E : `selectedReelHook` est passé à
  `useDoGenerate` et `hooksLoading` est lu tôt, alors que `doGenerate` et `questions`
  n'existent que plus bas ; le hook est appelé à la place des anciens états et ses
  actions reçoivent ce contexte au moment de l'appel. Déjà couvert par les tests du
  lot A (`creer-angles-reel-photos`), aucun test modifié.
- **Lot G**, en deux PR :
  - **G1** (PR en cours) : vidéo du reel liée à son script, sortie à l'identique dans
    `src/hooks/use-reel-artifact.ts`. `reel-editor-scope.test.tsx` lit désormais ce
    fichier (seuls le chemin et le repère de fin changent, les vérifications restent).
  - **G2** ensuite : publication et programmation (`use-creer-publish.ts`), avec
    `reel-publication.test.ts` à faire pointer vers le nouveau fichier.

## Découpage du Studio, `visual-studio/index.ts` (fiche 5) : terminé le 14/10/2026
2001 → 299 lignes ; `index.ts` n'est plus qu'un aiguilleur des 16 actions.
- **Lot 0** (#1478) : contrat du handler (16 actions : statut, clés, requêtes
  ordonnées, session enregistrée), snapshots de ce qui part vers Claude (6 tours),
  traduction des erreurs, rôles modifiés en place, ordre du quota dans `generate`.
  Harnais commun : `visual-studio/contract_harness.ts`.
- **Bug corrigé** (#1481) : une image bloquée dont le résultat est perdu restait
  « en cours » pour toujours (erreur de téléchargement vide avec supabase-js 2.95.3) ;
  elle passe en « incertaine » (`storage-errors.ts`).
- **Lots 1 à 4** (#1485, #1487, #1488, #1491) : `request-schema.ts`, `storage.ts`,
  `errors.ts`, `actions/*` (session, reference, composition, save, pilot, generate),
  `read-state.ts`. Crédits du Studio inchangés : fonctions SQL
  `studio_confirm_generation` / `studio_complete_generation`, pas `logUsage`.
- **Lots 5 à 8** (#1497, #1502, #1509, #1516) : branche `message` en
  `turn/brand-context.ts`, `turn/interpret.ts`, `turn/guardrails.ts`, `turn/proposal.ts`.
  Références et `intent` passés sans copie (règles qui modifient en place). Un test
  ajouté au lot 8 couvre l'ajout du mannequin de la mémoire aux références de la
  demande, qu'une copie aurait effacé sans qu'aucun autre test ne le voie.
- Méthode qui a marché : comparer par script le code déplacé à l'original, puis
  essayer volontairement une copie des objets pour vérifier que le filet la voit.

## En attente
- **E3, terminé le 14/10/2026** (3 816 → 1 155 lignes, 14 fichiers dans
  `src/components/creer/CarouselEditorParts/`) : découper CarouselEditor.tsx par mission (plan validé par Laetitia le
  14/10/2026, détail dans `gros-fichiers.md`, fiche 8). Une PR par morceau :
  - **E3-0** (#1495, fusionnée) : tests de branchement `carousel-editor-wiring.test.tsx`
    (20 cas : contrôle qualité, aligner / grouper, flèches, boutons des slides,
    calques masqués / retirés, fond, texte sur la photo, voile, aperçu Instagram) ;
  - **E3-1** (#1498, fusionnée) : `CarouselEditorParts/canvas-geometry.ts` et `PanelBits.tsx`
    (CarouselEditor.tsx : 3 816 → 3 626 lignes) ;
  - **E3-2** (#1500, fusionnée) : `CarouselEditorParts/CanvasToolbar.tsx`, la barre d'outils
    flottante (CarouselEditor.tsx : 3 626 → 3 441 lignes) ;
  - **E3-3** (#1507, fusionnée) : `CarouselEditorParts/SlideCanvas.tsx` (l'aperçu) et
    `canvas-events.ts` (ses réactions souris / clavier, corps de `bind` inchangé)
    (CarouselEditor.tsx : 3 441 → 2 250 lignes) ;
  - **E3-4** (#1512, fusionnée) : `LayersPanel.tsx` (calques, sélection multiple),
    `SlideSettings.tsx` (onglets Slide et Carrousel) et `panel-controls.tsx`
    (curseur, couleurs ; avancé depuis E3-5) (CarouselEditor.tsx : 2 250 → 1 905 lignes) ;
  - **E3-5** (#1517, fusionnée) : `TextSettings.tsx` et `ElementSettings.tsx` (photo, bloc),
    l'onglet « Élément » (CarouselEditor.tsx : 1 905 → 1 516 lignes) ;
  - **E3-6** (#1518, dernière PR du lot) : `EditorHeader.tsx`, `QualityPanel.tsx`, `SlideStrip.tsx`,
    `AllSlidesPanel.tsx` (CarouselEditor.tsx : 1 516 → 1 155 lignes, fin du découpage).
  Points d'attention relevés par E2 : `CARTE.md`, section 7 (écho reconnu à la
  référence, `inputKey`).
- **G4** : découper les autres gros fichiers, après la cartographie (carte 1).
- **G2** : une fiche « mission » par grande zone, avec des règles que Lovable lit.
- **G3, à trancher par Laetitia** : faire passer Lovable par les tests avant la
  production. Recherche du 14/10/2026 (docs Lovable non ouvertes directement,
  à revérifier) :
  - Lovable peut travailler sur une branche (Paramètres du projet → Git) ;
  - protéger `main` (tests obligatoires) pousse le travail Lovable sur une
    branche `lovable-sync*`, déjà transformée en PR par `lovable-sync-pr.yml` ;
  - MAIS les fonctions serveur et migrations faites par le chat Lovable partent
    tout de suite sur le Supabase de production, quelle que soit la branche ;
  - on ne sait pas si « Publish » publie la branche active : ne publier que depuis `main`.
  - Proposition : (1) générateurs et fonctions serveur par PR plutôt que par le
    chat Lovable ; (2) essai d'une semaine avec `main` protégée ;
    (3) plus tard, si besoin, un second projet Lovable et Supabase de test.

## Façon de travailler validée
- Un lot = une PR, tests et vérification avant push, fusion en squash une fois
  la CI verte (autorisation donnée par Laetitia le 14/10/2026).
- Explications en français simple, sans jargon ; ce qu'il faut vérifier dans
  l'app est listé à la fin de chaque lot.
- Pour les chantiers parallèles : cartes de nouvelles conversations, chacune
  avec les fichiers à ne pas toucher pour éviter les conflits.
- « L'éditeur » désigne l'éditeur visuel du carrousel (après création des
  visuels), pas l'étape « Modifier » du texte : vérifier l'écran visé avant de lancer un lot.
- Avant de fusionner : vérifier que la PR n'est pas en conflit avec `main` (une PR
  en conflit ne lance aucune CI) et qu'aucune session Lovable n'est ouverte.

## Lancer les tests dans une session Claude Code cloud (recette du 14/10/2026)
L'installation par défaut échoue (registre Lovable, deno.land et esm.sh bloqués) :
- Deno : `npm i deno@2.9.6` dans un dossier temporaire (Deno 2.5 donne de fausses
  « fuites d'intervalle ») ; passer à `deno test` une carte d'import hors dépôt
  qui redirige std vers `jsr:@std/...@0.224.0`, et zod, supabase-js, stripe vers `npm:` ;
- front : `npx npm@11 install --no-package-lock --ignore-scripts`, en remplaçant le
  temps de l'installation la ligne `xlsx` de `package.json` par `"0.18.5"`
  (cdn.sheetjs.com bloqué), puis remettre `package.json` tel quel ;
- appliquer à la main `patches/mammoth@1.12.1.patch` dans `node_modules/mammoth`.
- Variante sans changer de version de Deno : faire pointer `esm.sh/@supabase/supabase-js` vers une petite cale locale qui appelle `createClient` avec `autoRefreshToken: false` (sinon fausses « fuites d'intervalle »).
La CI de la PR reste la référence.

## Notes techniques (sessions Claude Code dans le cloud)
- La CI principale (`ci.yml`) ne tourne que sur les PR qui visent `main` : une PR empilée sur une autre branche n'est pas vérifiée. Changer la base d'une PR ne relance pas la CI ; il faut un nouveau commit.
- Installer les dépendances sans `bun` (registre Lovable refusé) : voir la section « Méthode » de `docs/robustesse/prompt-lot-e3.md`.
