## Diagnostic du "slop en cascade" sur le carrousel mixte

J'ai disséqué le pipeline. La sensation de **cascade** (texte qui descend en escalier, une slide qui en redit une autre en plus dramatique, montée en tension manufacturée) vient de **4 causes cumulées** dans `supabase/functions/carousel-ai/index.ts` et `supabase/functions/_shared/correction-pass.ts`.

### Cause 1 — La pass anti-slop ignore les overlays photo (LE plus gros impact mixte)

`extractCarouselTexts` (correction-pass.ts ligne 302) extrait pour correction uniquement `title`, `body`, `punchline`. Mais le format mixte a deux champs spécifiques jamais extraits :
- `overlay_text` (texte des slides `photo_full` — ~50 % du carrousel mixte)
- `note` (briefs DA visibles côté front sur certains rendus)

→ **Toutes les slides photo échappent à la correction anti-slop.** Les overlays restent en mode "phrase chic d'IA" pendant que les slides texte sont nettoyées. L'écart de qualité entre les deux types de slides crée justement cet effet de cascade artificielle.

### Cause 2 — L'exemple inline dans le prompt est lui-même du slop (et il est copié)

Ligne 1679, le prompt montre comme exemple :
> *"En vrai, le problème c'est pas l'algorithme. C'est qu'on poste en espérant que les gens vont deviner ce qu'on fait. Sauf que personne ne devine. Les comptes qui marchent, c'est ceux qui ont quelque chose à dire. (Et oui, toi aussi t'as des choses à dire.)"*

Problèmes : voix "ON/TU" (viole la règle anti-TU), structure "Le vrai problème c'est pas X, c'est Y" (formule manufacturée bannie), sujet générique Insta/algo qui n'a rien à voir avec le brief de l'utilisatrice. **Claude copie ce ton et cette structure** dans les slides texte → cascade de phrases qui s'amplifient ("En vrai…", "Sauf que…", "Et oui…").

### Cause 3 — Empilement de structures narratives qui force la redondance

Pour chaque carrousel mixte, l'IA reçoit jusqu'à **trois arcs narratifs simultanés** :
- L'arc générique imposé : `situation → tension → développement → résolution → ouverture` (ligne 1613)
- L'arc de l'angle éditorial choisi (`content_structure` injecté ligne 1549)
- La structure validée par l'utilisatrice (`confirmed_structure` ligne 1513-1535) avec des rôles type `hook → context → tip → tip → tip → cta`

→ L'IA empile une slide texte par "étape". Comme ces étapes sont sémantiquement proches, chaque slide **paraphrase la précédente en montant d'un cran émotionnel** — c'est exactement la cascade. Pire, il n'y a aucune règle anti-redondance entre slides texte consécutives.

### Cause 4 — Rien n'interdit la "rampe rhétorique"

Le prompt interdit plein de choses (formules manufacturées, anti-TU, etc.) mais **n'interdit jamais explicitement** :
- Ouvrir 2 slides texte de suite par un connecteur d'amplification ("En vrai…", "Et là…", "Sauf que…", "Sauf qu'en fait…")
- Reprendre le mot-clé de la slide précédente pour le redéfinir ("…l'algorithme. ─ slide suivante ─ L'algorithme, c'est…")
- Faire monter artificiellement les enjeux à chaque slide ("c'est important → c'est crucial → c'est vital")

## Plan correctif

### Étape 1 — Étendre la pass anti-slop aux overlays mixtes (impact #1)

Modifier `supabase/functions/_shared/correction-pass.ts` :

- **`extractCarouselTexts`** : ajouter l'extraction de `slide.overlay_text` sous le marqueur `[SLIDE N - OVERLAY]`.
- **`reinjectCarouselTexts`** : réinjecter ces corrections dans `slides[i].overlay_text`.
- **Prompt `carousel`** : ajouter une règle "11. OVERLAYS PHOTO : si l'overlay est une formule chic ou pourrait s'appliquer à n'importe quelle photo, le réécrire en phrase ancrée dans CE moment précis (5-15 mots, fait sensoriel ou détail concret)."

### Étape 2 — Remplacer l'exemple toxique du prompt mixte

Modifier `supabase/functions/carousel-ai/index.ts` ligne 1679 (et l'autre exemple ligne 1689 si même problème) :

- Remplacer l'exemple "En vrai, le problème c'est pas l'algorithme…" par un exemple **en JE**, sans formule "Le vrai X c'est pas Y c'est Z", ancré dans un sujet plausible mais varié, et avec un body court et descriptif (pour ne pas servir de modèle de cascade).
- Marquer explicitement dans le prompt : *"Les exemples ci-dessous sont là pour montrer la STRUCTURE JSON, pas le ton ni le contenu. Ne copie ni les formulations ni le sujet."*

### Étape 3 — Ajouter une section anti-cascade dans `buildMixCarouselPrompt`

Modifier `supabase/functions/carousel-ai/index.ts` lignes 1611-1620 (RÈGLES SPÉCIFIQUES MIX). Ajouter un bloc :

```
═══ INTERDICTION CASCADE / ESCALIER ═══
- Aucune slide texte ne doit ouvrir par un connecteur d'amplification ("En vrai", "Et là", "Sauf que", "Sauf qu'en fait", "Le vrai X c'est…", "C'est pour ça que…").
- Deux slides texte consécutives ne doivent JAMAIS répéter le même mot-clé central (si slide N parle de "visibilité", slide N+1 doit changer d'angle, pas redéfinir "visibilité").
- Pas de rampe émotionnelle artificielle ("c'est important" → "c'est crucial" → "c'est vital"). Une seule tension, posée une fois, puis on développe par EXEMPLES, pas par escalade.
- Chaque slide texte doit pouvoir tenir SEULE (test : si on la lit hors contexte, elle a un message clair). Si elle a besoin de la précédente pour faire sens → c'est une cascade, fusionne ou supprime.
```

### Étape 4 — Garde-fou anti-redondance dans la pass de correction

Modifier `supabase/functions/_shared/correction-pass.ts` prompt `carousel` (règle 3 actuelle "SLIDES REDONDANTES") :

- Renforcer : "3. SLIDES REDONDANTES OU EN CASCADE : si deux slides consécutives traitent la même idée avec une intensité montante, ou si l'une paraphrase l'autre, FUSIONNE-les en une seule slide qui pose le point une fois, ou remplace la plus faible par un nouvel angle (exemple, contre-exemple, chiffre, scène)."

### Étape 5 — Vérification

- `tsc --noEmit` passe.
- Test preview : générer un carrousel mixte 5 photos sur un sujet narratif → vérifier qu'aucune slide texte n'ouvre par "En vrai/Sauf que/Le vrai X", que les overlays photo sont concrets (pas génériques), et qu'on ne peut pas regrouper deux slides texte consécutives sous le même mot-clé.

## Hors-scope

- Pas de modification du flow upload photos / structure_proposal.
- Pas de changement du prompt photo pur ni du carrousel texte pur.
- Pas de changement de modèle IA.
