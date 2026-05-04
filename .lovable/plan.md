
# Plus de profondeur, zéro storytelling fabriqué

## Objectif
Quand tu génères un carrousel (surtout en mode actu), le texte doit parler du **fond du sujet**, pas inventer ta vie ni diagnostiquer ta lectrice. Trois leviers :

1. Interdiction totale d'inventer une scène vécue datée.
2. Profondeur recentrée : 1 slide de fond sectoriel/factuel + 1 slide de prise de position personnelle, obligatoires.
3. Quand Perplexity a fourni un contexte, l'IA est fortement incitée à s'en servir.

---

## Ce qui change concrètement

### 1. Anti-fabrication de scène vécue (nouveau bloc global)

Ajouter un bloc `ANTI_FABRICATED_STORYTELLING` injecté dans tous les prompts carrousel, qui :

- Bannit explicitement les marqueurs de scène vécue datée non fournie : "hier", "la semaine dernière", "ce matin", "j'ai reçu un message", "une cliente m'a dit", "j'ai vu passer", "lundi 7h", "il y a 3 jours", + toute date/jour précis.
- Règle : ces formules ne sont autorisées QUE si l'utilisatrice a fourni cet élément dans `deepening_answers.anecdote` ET que cet élément n'est PAS marqué `(élément tiré du branding)`.
- Si pas d'anecdote vécue fournie → l'IA généralise : "ce qui circule en ce moment", "ce que je vois passer dans ce milieu", "on entend souvent que", "il y a un truc qui revient", "dans ma pratique" (présent intemporel, pas de date).

### 2. Neutraliser le fallback "branding → anecdote"

Dans `carousel-ai/index.ts` (lignes 123-133), le fallback transforme actuellement ton storytelling de marque en `anecdote` à intégrer "mot pour mot". C'est ce qui force l'IA à fabriquer des scènes.

Changement : le fallback ne remplit plus `anecdote`. Il ne garde que `emotion` et `conviction` (qui sont des tonalités, pas des faits). L'anecdote reste vide → l'IA bascule automatiquement en mode "généralisation" décrit ci-dessus.

### 3. Nettoyer les exemples-piège dans les prompts

Trois exemples explicites poussent actuellement l'IA à inventer des scènes datées. Les réécrire en versions généralisantes :

- `copywriting-prompts.ts` ligne 86 : remplacer "La semaine dernière, une cliente m'a montré son calendrier éditorial. 45 posts en 2 mois…" par un exemple sans date ("Ce que je vois revenir : des calendriers de 45 posts sur 2 mois sans aucun lien avec l'offre.").
- `copywriting-prompts.ts` ligne 152 : enlever le template "La semaine dernière, une cliente m'a dit : '[verbatim]'".
- `carousel-ai/index.ts` ligne 1496 : remplacer "Et puis un jour, une cliente m'a dit quelque chose qui a tout changé" par un exemple narratif sans scène fabriquée.
- `copywriting-prompts.ts` ligne 390 : modifier "Pas d'exemples concrets → en inventer un crédible" en "Pas d'exemples concrets → généraliser sans inventer de scène vécue datée".

### 4. Profondeur double obligatoire (mode actu surtout)

Étendre le bloc `DEPTH_LAYER` avec une nouvelle exigence pour les carrousels mode actu, et l'incorporer aussi dans `buildMixCarouselNewsReactionPrompt` :

**Slide "fond du sujet" (obligatoire, 1 slide minimum)** : analyse du sujet lui-même — pas de la lectrice. Au moins une de ces dimensions :
- Mécanisme économique (qui gagne quoi, modèle d'affaires sous-jacent)
- Mécanisme sectoriel/historique (précédent, évolution, comparaison)
- Donnée factuelle vérifiable (chiffre, étude, cas connu)
- Acteur identifié (qui agit, quel intérêt)

Bannir explicitement comme angle de profondeur dans cette slide : biais cognitifs de la lectrice, syndrome de l'imposteur, peur du jugement, conditionnements personnels.

**Slide "prise de position incarnée" (obligatoire, 1 slide minimum)** : ton opinion tranchée sur le sujet — "moi je trouve que", "ce qui me dérange dans cette lecture", "la question qu'on évite", "je ne suis pas d'accord avec X parce que Y". Pas un diagnostic de la lectrice, une position d'autrice.

### 5. Exploitation favorisée du contexte Perplexity

Quand `news_context` est présent dans le payload du carousel-ai, ajouter au prompt une instruction explicite :

> "Le contexte actu fourni contient des faits, chiffres et acteurs identifiés. Tu es FORTEMENT encouragée à t'appuyer sur AU MOINS UN fait précis du contexte (chiffre, nom d'acteur, date d'événement, mécanisme évoqué) dans ta slide de fond. Tu NE PEUX PAS inventer un chiffre ou un fait absent du contexte. Si le contexte ne contient pas de fait exploitable, dis-le honnêtement par une formulation prudente plutôt que d'inventer."

### 6. Quality check enrichi

Ajouter au JSON de sortie 3 nouveaux flags :
- `fabricated_scene_detected: boolean` (true si une formule "hier/lundi/cette semaine/une cliente m'a dit" apparaît sans anecdote vécue fournie)
- `subject_depth_present: boolean` (true si au moins 1 slide analyse le fond du sujet et pas la psyché de la lectrice)
- `personal_stance_present: boolean` (true si au moins 1 slide exprime une opinion incarnée)

Si les deux derniers sont `false`, le correction-pass régénère les slides concernées.

---

## Détails techniques

**Fichiers modifiés :**
- `supabase/functions/_shared/copywriting-prompts.ts` : nouveau bloc `ANTI_FABRICATED_STORYTELLING`, extension de `DEPTH_LAYER` avec section "fond sectoriel + prise de position", nettoyage des 4 exemples-piège.
- `supabase/functions/_shared/user-context.ts` : `buildPreGenFallback` ne renvoie plus `anecdote` (juste `emotion` et `conviction`).
- `supabase/functions/carousel-ai/index.ts` : injection du nouveau bloc dans `buildSystemPrompt`, instruction Perplexity conditionnelle quand `news_context` présent, extension du `quality_check`, exemple ligne 1496 réécrit, intégration dans `buildMixCarouselNewsReactionPrompt`.
- `supabase/functions/_shared/correction-pass.ts` : déclencher une régénération des slides si `fabricated_scene_detected: true` ou si les flags profondeur sont `false`.

**Mémoire à mettre à jour après implémentation :**
- `mem://preference/carousels` : ajouter règle "zéro scène vécue datée fabriquée + double profondeur sujet/opinion obligatoire".
- `mem://preference/brand-voice` : renforcer "anti-storytelling fabriqué" comme règle globale.

**Pas d'impact sur :** newsletters, reels, posts simples (pour l'instant — on peut l'étendre dans un 2e temps si tu valides l'effet sur les carrousels).
