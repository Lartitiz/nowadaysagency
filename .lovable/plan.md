# Plan — Overlays du Carrousel photo Instagram : fragments au lieu de phrases narratives

## Diagnostic

Sur le mode **Carrousel photo + texte superposé** (Instagram, `carousel_type: "photo"`), les overlays générés sont des séries de fragments nominaux ponctués par des points — ex : `"89 000€. Montluçon. Secteur prisé, actif invisible."`. Quatre groupes nominaux, aucun verbe, aucune liaison avec la slide précédente. On swipe sans rien lire, l'histoire ne se construit pas.

Le prompt actuel (`buildPhotoCarouselPrompt` dans `supabase/functions/carousel-ai/index.ts`, lignes ~1561-1594) dit déjà "VRAIE PHRASE, pas juste un mot-clé" mais :

- Il ne définit pas "vraie phrase" → le modèle considère qu'une phrase nominale ponctuée passe.
- Il n'interdit pas explicitement le style "nom. nom. nom." (énumération de mots-clés).
- Les exemples positifs ("Trois mois. Zéro regret.") légitiment justement le format minimal-fragmenté.
- Le chaînage narratif est demandé sans contrainte de surface vérifiable.

## Correctif

**Fichier unique** : `supabase/functions/carousel-ai/index.ts`, sections `═══ RÈGLES OVERLAY ═══` et `═══ CHAÎNAGE DES TEXTES ═══` de `buildPhotoCarouselPrompt`.

1. **Règle "vraie phrase"** : exiger un **sujet + verbe conjugué** dans chaque overlay. Ajouter : "Une suite de groupes nominaux séparés par des points (`Mot. Mot. Adjectif, mot.`) n'est PAS une phrase et est INTERDITE."
2. **Contre-exemple explicite** proche du cas réel : `"89 000€. Montluçon. Secteur prisé, actif invisible."` → marqué INTERDIT, avec réécriture conforme (`"À 89 000€ à Montluçon, ce secteur prisé cache un actif que personne ne voit passer."`).
3. **Style "minimal"** : limiter à **1 slide max** sur tout le carrousel, et imposer un verbe même en minimal ("Trois mois ont suffi." plutôt que "Trois mois. Zéro regret."). Style "technique" : données chiffrées toujours insérées dans une phrase complète. ici je veux vraiment qu'il y ait une narration que ça raconte une histoire slide après slide 
4. **Chaînage** : règle de surface — chaque overlay à partir de la slide 2 DOIT contenir soit un connecteur narratif (`Puis`, `Sauf que`, `C'est là que`, `Et`, `Mais`, `Alors`, `Du coup`, `Trois mois plus tard`…), soit reprendre un mot/groupe de la slide précédente. Au moins un des deux.
5. **Quality_check** : ajouter `every_overlay_has_verb: true` et `no_nominal_fragment_lists: true` dans le JSON de sortie pour forcer l'auto-validation.
6. La passe de correction existante bénéficie automatiquement du prompt durci. Pas d'autre changement.

## Validation

- Re-générer un carrousel photo Instagram à partir des mêmes photos. Vérifier :
  - Chaque overlay a un verbe conjugué.
  - Aucun overlay n'est une énumération `Nom. Nom. Nom.`.
  - À partir de la slide 2, un connecteur ou une reprise lexicale lie à la slide précédente.
  - Lecture en continu comme un mini-récit.

## Hors scope

- Pas de modif des modes `pure_photo`, `mix`, ou des carrousels texte/storytelling.
- Pas de changement frontend ni du renderer `CarouselPhotoResult.tsx` (textarea reste éditable).
- Pas de changement de modèle ni de température.