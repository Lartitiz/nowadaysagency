## Périmètre

Fichier unique : `supabase/functions/_shared/correction-pass.ts`. Modifications **uniquement** dans le template `carousel` de l'objet des prompts (lignes 83-136). Aucune fonction TS, aucun autre template, aucun marqueur de format touché.

## (a) Modifications demandées

### 1. Règle 3 réécrite (lignes 97-99)

Recibler : on garde la fusion des cascades par paraphrase amplifiée, on lève l'interdiction absolue des connecteurs d'ouverture, on introduit le critère de distinction cascade vs chaînage.

Nouveau contenu :

```
3. SLIDES REDONDANTES OU CASCADE D'AMPLIFICATION :
   → Cascade = même idée reformulée plus fort d'une slide à l'autre ("c'est important" → "c'est crucial" → "c'est vital"), ou paraphrase qui reprend le même mot-clé central sans rien ajouter. Dans ce cas SEULEMENT : fusionne les deux slides, ou remplace la plus faible par un nouvel angle (exemple, contre-exemple, chiffre, scène).
   → Chaînage narratif = idée NOUVELLE (fait, scène, donnée, exemple, bascule) accrochée à la précédente par un connecteur ("Sauf que", "Et puis", "C'est là que", "Puis", "Alors", "Résultat") ou une reprise lexicale. C'est VOULU, on ne touche pas.
   → Test de distinction : si la slide qui ouvre par "Sauf que / Et là / C'est là que" apporte un contenu nouveau (fait, détail, retournement) → garde l'ouverture intacte. Si elle ne fait que reformuler la précédente en plus fort → réécris.
```

### 2. Règle 11 complétée (ligne 126-127)

Conserver la règle anti-formule chic existante et ajouter trois points :

```
11. OVERLAYS PHOTO (carrousels mixtes — marqueur [SLIDE N - OVERLAY]) :
    → Si l'overlay est une formule chic ou pourrait s'appliquer à n'importe quelle photo ("Quand la magie opère", "Un instant suspendu", "L'art du détail"), réécris-le en phrase ANCRÉE dans CE moment précis : un fait sensoriel (ce qu'on voit/entend/sent), un détail concret, ou une parole captée. 5-15 mots max. Pas d'abstraction décorative.
    → NE JAMAIS supprimer le connecteur narratif ("Sauf que", "Et puis", "C'est là que"…) ou la reprise lexicale qui ouvre un overlay : c'est le chaînage voulu entre slides. Si tu réécris l'overlay, la version réécrite doit conserver un lien explicite avec la slide précédente (connecteur ou reprise d'un mot-clé).
    → Un overlay reste 1 phrase de 5-25 mots. Ne JAMAIS le développer en 2-4 phrases : la consigne globale de longueur ne s'applique PAS aux lignes [SLIDE N - OVERLAY].
    → Un overlay qui n'a de sens qu'après la slide précédente est un signe de qualité, pas un défaut à corriger.
```

### 3. Règles absolues renforcées (ligne 130-131)

Compléter le premier puce :

```
- Garde l'ARC NARRATIF du carrousel. Dans les carrousels photo/mix, le CHAÎNAGE entre slides (connecteurs narratifs en ouverture, reprises lexicales d'une slide à l'autre) est une exigence de génération : le préserver, ne jamais le lisser.
- Chaque slide texte corrigée : 2-4 phrases (sauf slide 1 : 1-2 max, sauf overlays [SLIDE N - OVERLAY] : 1 phrase 5-25 mots).
```

## (b) Proposition complémentaire — à valider AVANT exec

En lisant le fichier, le template `carousel` modifié ci-dessus est le prompt **texte simple**, mais le chemin réellement emprunté par la correction des carrousels JSON passe par `CAROUSEL_CORRECTION_PROMPT` (lignes 242-328, appelée via `applyCorrectionPassCarousel` / `carousel-json`). Ce second prompt ne contient aucune règle sur les overlays ni sur le chaînage et serait donc le **vrai** lieu de l'effet recherché en production.

Deux options :
- **B1** : appliquer en plus les mêmes 3 ajustements (anti-cascade nuancée, règle overlays, mention chaînage dans RÈGLES ABSOLUES) à `CAROUSEL_CORRECTION_PROMPT`. Recommandé si tu veux que le fix soit réellement visible sur les carrousels mix générés aujourd'hui.
- **B2** : laisser de côté, périmètre strict respecté, on traite `CAROUSEL_CORRECTION_PROMPT` dans un plan séparé.

Le plan demandé (a) est exécutable seul ; B1/B2 est une décision à prendre avant que je passe en build.

## Hors scope (confirmé)

- Fonctions TS (`extractCarouselTexts`, `reinjectCarouselTexts`, `applyCorrectionPass*`)
- Autres templates (`linkedin`, `newsletter`, `instagram_caption`, `reel`, `stories`)
- Règles 1, 2, 4-10 du template carousel
- Marqueurs `[SLIDE N - …]`, format JSON, format de réponse
- Tout autre fichier du repo

## Validation

- `npx tsc --noEmit --skipLibCheck` → 0 erreur
- Test manuel : génération carrousel mix 2-3 photos → connecteurs d'ouverture des overlays survivent, overlays restent 1 phrase courte, cascade amplifiée toujours fusionnée

## Question avant exec

Dois-je appliquer (a) seul, ou (a) + B1 (étendre les mêmes 3 ajustements à `CAROUSEL_CORRECTION_PROMPT`) ?
