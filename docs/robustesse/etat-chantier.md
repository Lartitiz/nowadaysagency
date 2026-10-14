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

## Lancés en conversations séparées (cartes du 14/10/2026)
1. Cartographier les gros fichiers et poser un cliquet anti-dette (G1).
2. Figer l'éditeur visuel par des tests (E2).
3. Borner la relance automatique des visuels (crédits consommés en arrière-plan, à confirmer).
4. Étendre les garde-fous au design et à l'édition (lot 9).
5. Poser les petits verrous de la création (lot 10).
6. Finir de séparer texte et design du carrousel (lot 8).

## En cours de relecture
| Lot | PR | Contenu |
|---|---|---|
| 8 | #1475 | Carrousel : choix de design de `carousel-ai` isolés dans `carousel-ai/layout.ts` (sortie identique, figée par `carousel-ai/handler_contract_test.ts`) ; frontière design / écriture testée (`_shared/carousel-design-boundaries_test.ts`) ; libellé du bouton d'appel à l'action rangé dans la slide (`cta_label`) |

Reste du lot 8, pour un lot 8b :
- parcours de `carousel-ai` pas encore figés : `structure_proposal`, `suggest_topics`, `suggest_angles`, `deepening_questions` (texte et photos) et le récit continu photo / mixte (chemin par défaut en production quand il y a des photos) ;
- dernier choix de design encore fait à l'écriture : le mot mis en valeur sur la couverture (`cover_accent`, `carousel-ai/continuous-narrative.ts`), seule exception de `CARROUSEL_AI_AUTORISES` ;
- carrousel texte : le libellé du bouton n'entre dans la slide que si l'utilisatrice le modifie ou le retire ; à l'arrivée des visuels, il reste seulement dans le HTML (lecture dans `src/hooks/use-generate-visuals.ts`, fichier d'une autre conversation le 14/10/2026).

## En attente
- **E3** : découper CarouselEditor.tsx par mission, après E2.
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
