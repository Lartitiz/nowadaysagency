Objectif : faire respecter les règles anti-slop déjà écrites en les rendant **concrètes** (exemples ❌/✅) et en bouchant les contournements observés sur le post analysé.

Aucun changement de logique ni de UI. Uniquement des ajustements de prompts dans 2 fichiers edge function.

## 1. `supabase/functions/_shared/vision-prompts.ts` — `buildVisionGenerateBrief` (branche LinkedIn)

Renforcer le `formatBrief` LinkedIn avec :

**a) Règle anti-paraphrase élargie** (le contournement "ce flyer", "ce comptoir" n'est pas couvert) :

```
INTERDIT DE DÉSIGNER LES IMAGES, même sans les numéroter :
❌ "Ce flyer orange et jaune, c'est…"
❌ "Ce comptoir bleu avec ses illustrations…"
❌ "Sur la première, on voit… sur la seconde…"
✅ Tu peux NOMMER ce qui est sur les images (l'événement, le lieu, l'objet) sans
   les introduire comme images
```

**b) Few-shot négatif ciblé sur la cascade** (interdit déjà énoncé mais ignoré) :

```
INTERDIT — phrases-listes parallèles, même déguisées en oral :
❌ "Pas un musée à cocher. Un verre au comptoir. Une conversation qui s'étire."
❌ "Pas pour faire joli. Pour créer du lien."
✅ Une seule pensée qui se déroule en phrases complètes.
```

**c) Anti-CTA fabriqué** avec exemple :

```
❌ « Ici, il se passe quelque chose. Venez. »
❌ "Et vous, vous en pensez quoi ?"
✅ Couper net sur la dernière phrase du message, OU une phrase ouverte non-injonctive.
```

**d) Réduire la longueur cible** : passer `900-1400` → `700-1100`. Le post analysé fait ~1400 et c'est trop long pour la matière réelle. Plus court = moins de remplissage = moins de slop.

## 2. `supabase/functions/creative-flow/index.ts` — bloc anti-fabrication (ligne 1297)

Ajouter une ligne explicite sur les **chiffres et mentions textuelles visibles** :

```
- Si un chiffre, une édition (#3), une date, un nom propre est VISIBLE sur une
  image, recopie-le EXACTEMENT. N'invente jamais un numéro d'édition, une date
  ou un nom que tu n'as pas lu littéralement.
```

(Évite le bug "#3 devient #8".)

Et renforcer `modeInstr` série pour interdire les **transitions descriptives** :

```
INTERDIT d'enchaîner "Ce X visible sur une image, c'est… Ce Y visible sur une autre, c'est…".
Le post doit parler du SUJET, pas faire le tour des images.
```

## Hors scope (volontairement)

- Pas de refonte structurelle des prompts
- Pas de changement sur `buildVisionQuestionsPrompt` (les questions générées sont OK)
- Pas de changement frontend
- Pas de changement sur les autres canaux (reel/story/newsletter/IG caption)
- Pas de redéploiement nécessaire côté DB / migration

## Vérification après build

Re-générer un post avec les 3 mêmes photos + sujet "tiers-lieu rural / slow tourisme" et vérifier :

- Aucune phrase "Ce [adjectif visuel] [objet], c'est…"
- Aucune cascade "Pas X. Pas Y."
- Si "#3" apparaît, c'est bien #3 et pas #8
- Longueur ≤ 1100