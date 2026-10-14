# Prompt de lancement du lot E3 (découpage de l'éditeur visuel)

Préparé le 14/10/2026 à la fin du lot E2. À copier tel quel dans une nouvelle
session Claude Code (le cloud convient : aucun outil local n'est nécessaire).

```
Lot E3 du chantier « robustesse » de L'Assistant Com' (dépôt github.com/Lartitiz/nowadaysagency) : découper l'éditeur visuel du carrousel, src/components/creer/CarouselEditor.tsx (3 816 lignes, composants SlideCanvas et CarouselEditor), en fichiers par mission, SANS changer son comportement.

PRÉALABLE : les PR #1476 (lot E2, tests qui figent l'éditeur) et #1477 (2 bugs corrigés) sont fusionnées depuis le 14/10/2026. Vérifie sur main que les fichiers src/test/carousel-editor-*.test.tsx existent ; sinon, dis-le-moi et arrête-toi.

ÉTAPE 1 : TOUT RELIRE, AVANT DE PRODUIRE QUOI QUE CE SOIT
Pars de la branche main à jour, puis lis dans cet ordre :
1. CLAUDE.md (racine du dépôt) : conventions, règles d'or, sections « Création de contenu », « Lovable ↔ GitHub » et « Gros fichiers : cliquet anti-dette ».
2. docs/robustesse/etat-chantier.md : où en est le chantier, ce qui est fusionné, la façon de travailler validée, les notes techniques.
3. docs/robustesse/gros-fichiers.md : la méthode de découpage (en tête du document) et la fiche n° 8 sur CarouselEditor.tsx ; la fin du document sur le cliquet anti-dette (scripts/cliquet-dette.mjs, scripts/cliquet-dette.baseline.json).
4. docs/creation-contenu/CARTE.md : section 5 (« Éditeur visuel du carrousel : comportement figé (lot E2) ») et section 7 (points d'attention de l'éditeur, en particulier l'écho reconnu à la référence par inputKey, cause de la boucle infinie corrigée par le commit ec445582).
5. Les tests qui protègent l'éditeur : src/test/carousel-editor-*.test.tsx (lot E2) et les autres src/test/carousel-*.test.tsx qui montent CarouselEditor (marquee, multi, shortcuts, toolbar, layers, group-lock, panel-tabs, panel-sections, photo-frame, saved-styles, history-insta, memo-loop, editability-audit…). Ils sont le filet du découpage.
6. L'existant : CarouselEditor.tsx en entier, src/lib/carousel-editor.ts (logique pure, 1 808 lignes, hors périmètre), et son branchement dans src/pages/CreerUnifie.tsx (onCarouselDocumentChange → mergeEditorRaw, setVisualSlides) et src/hooks/use-carousel-autosave.ts.

Puis restitue-moi en quelques lignes, en français simple (je ne suis pas développeuse) :
- les missions que mélange CarouselEditor.tsx aujourd'hui, avec leurs plages de lignes ;
- le découpage que tu proposes (nouveaux fichiers, ce que chacun reçoit, ordre des PR) ;
- les risques repérés (état partagé, refs, écho, historique d'annulation) et les tests qui manqueraient encore ;
- toute contradiction entre ces sources.
Arrête-toi là et attends ma validation avant de déplacer la moindre ligne.

ÉTAPE 2 : LE TRAVAIL À FAIRE (après validation)
- Découper CarouselEditor.tsx en fichiers par mission, dans un dossier dédié (par exemple src/components/creer/carousel-editor/). Le code est DÉPLACÉ À L'IDENTIQUE ; CarouselEditor.tsx garde son export par défaut et réexporte ce qu'il exportait, pour que CreerStepResult.tsx et les tests n'aient pas à changer.
- Une PR par morceau, chacune visant main (la CI ne tourne que sur les PR vers main), avec : npm test, npx tsc --noEmit -p tsconfig.app.json, npm run knip, node scripts/cliquet-dette.mjs. Quand CarouselEditor.tsx a maigri, abaisser sa ligne dans le cliquet (node scripts/cliquet-dette.mjs --update) dans la même PR.
- Mettre à jour docs/creation-contenu/CARTE.md (fichiers de l'éditeur) et docs/robustesse/etat-chantier.md à chaque PR.
- Rapport final en français simple : ce qui a changé, ce qui n'a pas changé pour l'utilisatrice, ce qu'il faut vérifier dans l'app.

ÉTAPE 3 : DÉCISIONS DÉJÀ PRISES (ne pas rouvrir)
- 14/10/2026 : méthode de découpage du chantier robustesse = un fichier par mission, code déplacé à l'identique, le fichier d'origine réexporte, tests posés AVANT de déplacer (gros-fichiers.md).
- 14/10/2026 : les tests du lot E2 (src/test/carousel-editor-*.test.tsx) et tous les tests carousel-* existants doivent passer SANS être modifiés. Un test qu'il faudrait retoucher = une régression : corriger le code, pas le test.
- 14/10/2026 : cliquet anti-dette en CI : aucun gros fichier ne doit grossir ; un nouveau fichier doit rester sous 800 lignes.
- 14/10/2026 : un lot = une PR, tests avant push, fusion en squash une fois la CI verte (autorisation donnée par Laetitia, etat-chantier.md). Ne pas fusionner pendant une session Lovable ouverte : demander d'abord.
- Toucher un générateur ou l'éditeur = branche + PR, jamais Lovable directement sur main (CLAUDE.md).
- Hors périmètre : src/lib/carousel-editor.ts (logique pure), CreerUnifie.tsx, les exports (export-carousel-*), supabase/functions/ et carousel-dom-contract.ts. Aucune nouvelle fonctionnalité, aucune correction de bug au passage : un bug trouvé est noté dans CARTE.md section 7 et dans le rapport, pas corrigé.
- « L'éditeur » = l'éditeur visuel du carrousel (après création des visuels), pas l'étape « Modifier » du texte.

ÉTAPE 4 : POINTS ENCORE OUVERTS (à trancher avec moi, une question à la fois)
- Le découpage exact (quels fichiers, dans quel ordre) : tu proposes à l'étape 1, je valide.
- Faut-il ajouter des tests avant certains déplacements (trous que tu aurais repérés) ?
- Faut-il séparer SlideCanvas (aperçu dans l'iframe : glisser, poignées, repères, dépôt de photo) dans son propre lot, avant le panneau de réglages ?

ÉTAPE 5 : MÉTHODE
- Cadrer dans le chat avant de produire ; une question à la fois ; explications sans jargon.
- Installation des dépendances dans le cloud : bun install échoue (bun.lock pointe vers le registre de Lovable, 403). Contournement qui a marché le 14/10/2026 : copier package.json dans un dossier temporaire, y remplacer les références "$postcss" et "$vite" des overrides par des versions, remplacer xlsx (cdn.sheetjs.com, refusé) par "0.18.5", npm install --ignore-scripts, puis lier node_modules dans le dépôt (ignoré par git). Dans ce cas, quelques tests sans rapport échouent en local (patch mammoth non appliqué, pptxgenjs introuvable) : la CI de la PR fait foi.
- Les tests qui montent l'éditeur sont lents : passer leur DOM avec getByLabelText ou des sélecteurs plutôt que getByRole sur toute la page ; lancer les fichiers carousel-* par petits groupes.
- La suppression de branches GitHub est refusée (403) depuis le cloud : la laisser à Laetitia.
```
