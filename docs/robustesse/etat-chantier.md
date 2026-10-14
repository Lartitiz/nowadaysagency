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

## Prochain : lot 8b (prompt prêt le 14/10/2026, pas encore lancé)
Reste du lot 8 :
- parcours de `carousel-ai` pas encore figés : `structure_proposal`, `suggest_topics`, `suggest_angles`, `deepening_questions` (texte et photos) et le récit continu photo / mixte (chemin par défaut en production quand il y a des photos) ;
- dernier choix de design encore fait à l'écriture : le mot mis en valeur sur la couverture (`cover_accent`, `carousel-ai/continuous-narrative.ts`), seule exception de `CARROUSEL_AI_AUTORISES` ;
- carrousel texte : le libellé du bouton n'entre dans la slide que si l'utilisatrice le modifie ou le retire ; à l'arrivée des visuels, il reste seulement dans le HTML (lecture dans `src/hooks/use-generate-visuals.ts`, fichier d'une autre conversation le 14/10/2026).

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
- **Lot C** ensuite : fonctions pures (`creer-step.ts`, `draft-conflict.ts`,
  `pending-stream.ts`, `edit-text-from-result.ts`, `content-brief.ts`), voir la fiche 1.

## En attente
- **E3** : découper CarouselEditor.tsx par mission (plan validé par Laetitia le
  14/10/2026, détail dans `gros-fichiers.md`, fiche 8). Une PR par morceau :
  - **E3-0** (#1495, fusionnée) : tests de branchement `carousel-editor-wiring.test.tsx`
    (20 cas : contrôle qualité, aligner / grouper, flèches, boutons des slides,
    calques masqués / retirés, fond, texte sur la photo, voile, aperçu Instagram) ;
  - **E3-1** (#1498, fusionnée) : `CarouselEditorParts/canvas-geometry.ts` et `PanelBits.tsx`
    (CarouselEditor.tsx : 3 816 → 3 626 lignes) ;
  - **E3-2** (#1500, fusionnée) : `CarouselEditorParts/CanvasToolbar.tsx`, la barre d'outils
    flottante (CarouselEditor.tsx : 3 626 → 3 441 lignes) ;
  - **E3-3** (en cours) : `CarouselEditorParts/SlideCanvas.tsx` (l'aperçu) et
    `canvas-events.ts` (ses réactions souris / clavier, corps de `bind` inchangé)
    (CarouselEditor.tsx : 3 441 → 2 250 lignes) ;
  - E3-4 et E3-5 panneau de réglages ; E3-6 en-tête,
    contrôle qualité, miniatures, « Toutes les slides » et « Mes styles ».
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
La CI de la PR reste la référence.

## Notes techniques (sessions Claude Code dans le cloud)
- La CI principale (`ci.yml`) ne tourne que sur les PR qui visent `main` : une PR empilée sur une autre branche n'est pas vérifiée. Changer la base d'une PR ne relance pas la CI ; il faut un nouveau commit.
- Installer les dépendances sans `bun` (registre Lovable refusé) : voir la section « Méthode » de `docs/robustesse/prompt-lot-e3.md`.
