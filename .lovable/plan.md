## Le problème observé

Tu pars d'une actu → tu choisis un carrousel mix. Résultat :

1. **Texte slide-par-slide, pas connecté** : chaque slide explique un point comme un cours. Pas de fil narratif, pas de "moi, voilà ce que j'en pense". On dirait un résumé d'article, pas une prise de parole.
2. **Angle dévalorisant** : le carrousel finit toujours par dire à l'audience "tu attends la permission", "tu es bloquée par X". L'audience est victimisée. Toi, tu veux parler d'elle SANS appuyer sur ses douleurs — surtout quand on parle d'un sujet plus large que sa vie perso.

## D'où ça vient (diagnostic technique court)

Dans `buildMixCarouselPrompt` + `buildSystemPrompt` (`carousel-ai/index.ts`) :

- Quand le `news_context` est injecté, la consigne dit "le hook part de l'actu, puis pont vers ton expertise" — mais **rien ne garantit que TA voix/opinion porte tout le reste du carrousel**. L'IA retombe dans le réflexe "j'explique l'actu en 5 points".
- Les règles "DEPTH_LAYER" demandent de nommer un mécanisme/biais cognitif. Sur un sujet d'actu globale, l'IA choisit par défaut le mécanisme **"mes lectrices subissent X"** (estime de soi conditionnelle, attente de permission, syndrome de l'imposteur…) → ça produit le ton paternaliste que tu détestes.
- Le bloc ANTI-BIAIS interdit déjà "tu as le droit de prendre de la place" mais ne couvre pas la version subtile ("elle attend la permission", "on a intériorisé qu'on devait…"). 
- Pas de mode dédié "carrousel d'opinion sur une actu" : on traite ça comme un carrousel mix classique avec une actu greffée en intro.

## Ce que je propose

### A. Un mode narratif "réaction d'autrice" pour les carrousels mix issus d'une actu

Quand `news_context` est présent ET `carousel_type === "mix"`, on bascule sur un **prompt dédié** qui :

- **Voix dominante = JE qui réagit**. Pas "voilà ce qui se passe + 5 points" mais "voilà ce que je vois passer / ce que ça me fait / pourquoi je trouve que c'est plus profond que ce qu'on dit".
- **Arc narratif unique** imposé : actu déclencheuse → ce qui m'a frappée précisément → là où je décale (où je ne suis pas d'accord avec la lecture commune / où je vois autre chose) → ce que ça révèle de plus large → ce que je propose comme regard, sans donner d'ordre.
- **Continuité explicite slide-à-slide** : chaque slide est une étape de MA pensée, pas un point de liste. Test ajouté en quality_check : "si je lis les `body` à la suite, est-ce que ça forme un monologue cohérent ?"
- **Le "vous/tu" disparaît presque** : 0 slide d'interpellation directe sauf le CTA final. L'audience est convoquée par ricochet ("on" inclusif au sens "nous toutes qui regardons ça"), jamais désignée comme problème.

### B. Garde-fous anti-victimisation de l'audience

Nouvelle section dans le system prompt, active dès qu'il y a un `news_context` (et utile aussi hors news) : oui faire hors news aussi

- **Interdiction de positionner l'audience en victime/en attente** : pas de "elle attend la permission", "elle a peur de", "elle s'auto-sabote", "elle a intériorisé que…", "tu n'oses pas", "tu te dévalorises", "tu te compares". Liste explicite de patterns interdits.
- **Le mécanisme nommé doit porter sur LE SUJET, pas sur la psyché de la lectrice** : si l'actu c'est "machin", le mécanisme c'est un truc systémique/culturel/économique du sujet, pas "le syndrome de l'imposteur de mes lectrices".
- **Règle "miroir vs projecteur"** : sur un sujet large, le carrousel est un PROJECTEUR (on regarde le sujet ensemble), pas un MIROIR (qui te renvoie tes failles). Reformulation possible : au lieu de "tu n'oses pas X", dire "X est rendu difficile par Y" ou "moi je pense que X mérite mieux que ce qu'on en dit".

### C. Profondeur via opinion incarnée, pas via diagnostic psy

Adapter la définition de "slide pivot" pour ce mode :

- La slide pivot n'est plus "la croyance retournée de la lectrice" mais **"la prise de position personnelle qui décale"** : un truc que toi tu vois et que la lecture dominante de l'actu rate.
- Les slides text_only doivent porter : un fait précis sur l'actu, une opinion tranchée signée, une nuance qu'on entend pas ailleurs, un parallèle avec ton métier — **jamais** un diagnostic sur la lectrice.
- Quality_check enrichi : `audience_as_victim: false`, `je_voice_dominant: true`, `opinion_visible_in_at_least_2_slides: true`.

### D. Effet sur le pont actu → métier

Garder l'idée du "pont" actuelle, mais le formuler autrement : pas "voilà ce que cette actu dit de TON business" mais "voilà ce que cette actu touche dans MON terrain / MA pratique". L'audience entend "elle parle vraiment, donc je m'identifie", au lieu de "elle me fait la leçon".

## Périmètre du changement (technique)

- 1 fichier modifié : `supabase/functions/carousel-ai/index.ts`
  - Nouvelle fonction `buildMixCarouselNewsReactionPrompt()` utilisée quand `news_context` + `carousel_type === "mix"`.
  - Ajout d'un bloc `ANTI_AUDIENCE_VICTIMIZATION` (réutilisable plus tard pour d'autres formats si tu veux).
  - Champs `quality_check` enrichis.
- Aucune migration DB, aucun changement front, aucun changement d'autres formats (LinkedIn, reels, posts simples, carrousel mix sans actu = inchangés).
- Déploiement : 1 edge function (`carousel-ai`).

## Ce qui ne change PAS (pour rassurer)

- Carrousel mix **sans actu** = comportement actuel inchangé (toute la philo profondeur reste).
- Newsjacking côté recherche (Perplexity + 6 axes) = inchangé, on travaille uniquement la GÉNÉRATION du carrousel après que tu aies cliqué sur une actu.
- Ton de marque, anti-slop, écriture inclusive, anti-em-dash = tout reste.
- Les règles anti-TU existantes ne sont pas supprimées, elles sont durcies sur ce mode précis.

## Ce que je veux valider avec toi avant de coder

Trois points pour être sûre de pas dériver :

1. **Le "vous/tu" dans ce mode** : on supprime totalement (sauf CTA), ou on garde 1 slide max d'interpellation douce ?
2. **L'opinion personnelle** : je peux pousser jusqu'à des prises de position un peu tranchées ("moi je trouve que…", "ça me gonfle que…"), ou tu veux rester dans la nuance posée ?
3. **Hors mode actu** : la garde anti-victimisation, on l'applique seulement aux carrousels mix avec actu, ou on l'étend à TOUS les carrousels (texte + mix + sans actu) parce que le problème existe sûrement ailleurs aussi ?