## Problème

Le vibe **"Scoop qui fait réagir"** doit ramener du **vrai newsjacking** : des actus chocs, virales, qui font réagir tout le monde cette semaine, sur lesquelles l'utilisatrice peut rebondir publiquement. Aujourd'hui ça sort des sujets tièdes et confortables.

## Cause

Dans `supabase/functions/newsjacking-ai/index.ts` :

1. Le mapping vibe est faible :
   ```ts
   scoop: { axe: "actu_connectable", label: "Scoop qui fait réagir", query_hint: "scoop révélation qui fait réagir" }
   ```
   Le hint envoyé à Perplexity est mou et ne cible pas l'actu chaude virale.

2. Le pipeline pousse par défaut vers les **micro-phénomènes culturels** (mot qui revient, obsession collective…). C'est l'opposé d'un scoop d'actu chaude.

3. La règle "force_pont fort à 2/3" pousse vers des sujets très ancrés niche, donc tièdes — incompatible avec du newsjacking où l'actu prime et le pont peut être plus libre.

4. Aucun marqueur "viralité / choc" n'est demandé à Claude pour qualifier un scoop.

## Plan

### 1. Réécrire le mapping vibe "scoop" pour viser l'actu chaude virale

Dans `VIBES_MAP` :
- `query_hint` orienté newsjacking : "actualité choc qui fait débat cette semaine France, polémique virale, révélation qui sort, affaire qui éclate, chiffre qui choque, scandale du moment"
- Conserver `axe: "actu_connectable"` mais traiter ce vibe comme un **mode dédié** (voir étape 3).

### 2. Booster le sourcing Perplexity en mode scoop

Quand `intentVibesValid.includes("scoop")` :
- Forcer `recency: "day"` au lieu de `"week"` pour cibler le chaud du moment.
- Augmenter le pool : récupérer jusqu'à **6 actus chaudes** au lieu de 3.
- Couper le biais niche (comme en `macroMode`) pour ne pas filtrer les vrais scoops trop tôt.

### 3. Activer un **MODE SCOOP** dans le system prompt

Nouveau bloc `scoopBlock` injecté quand le vibe scoop est demandé, avec priorité maximale :

- **Objectif** : ramener 3 à 5 actus chaudes de la semaine (idéalement des derniers jours) qui font réagir publiquement — pas des micro-phénomènes culturels.
- **Source obligatoire** : puiser en priorité dans le bloc "Actus chaudes pré-sourcées" + recherches web ciblées (`site:lemonde.fr`, `site:liberation.fr`, `site:huffingtonpost.fr`, `site:nouvelobs.fr`, `site:slate.fr`, `site:mediapart.fr`, `site:konbini.com`, `site:numerama.com`, `site:franceinfo.fr`).
- **Test "oh wow"** : pour chaque sujet, la cible doit avoir une réaction physique au titre (sourcils qui se lèvent, envie de partager, "attends quoi ?"). Au moins UN marqueur : chiffre contre-intuitif, info cachée révélée, contradiction d'une croyance dominante, dérive systémique nommée, retournement d'enquête, polémique en cours, déclaration publique qui fait réagir.
- **Interdit explicite** : "X est en hausse", "tendance Y observée", "selon une étude récente…" sans angle révélateur ; sujets evergreen ; micro-phénomènes culturels mous.
- **Relâcher le pont** : en mode scoop, la règle "force_pont fort à 2/3" devient "moyen acceptable à 2/3, fort à 1/3". Le pont devient une **piste de réaction** : "voici comment cette personne peut rebondir publiquement", pas un pont littéral citant son métier.
- **Conserver les exclusions éthiques** : pas de faits divers tragiques, pas de politique partisane.

### 4. Désactiver la contrainte micro-phénomènes en mode scoop

Quand scoop est actif, court-circuiter le bloc "MICRO-PHÉNOMÈNES" du prompt (ou le rendre secondaire) pour que Claude ne dilue pas les résultats avec des sujets culturels lents.

### 5. Reformuler le label UI

Dans `VIBES_MAP.scoop.label` : passer de "Scoop qui fait réagir" à **"Actu choc à rebondir"** pour aligner l'attente utilisatrice avec ce que le pipeline va vraiment renvoyer.

## Fichier touché

- `supabase/functions/newsjacking-ai/index.ts` (mapping VIBES, paramètres Perplexity en mode scoop, nouveau `scoopBlock` dans system prompt, désactivation conditionnelle du bloc micro-phénomènes)

Aucun changement DB. Le label UI change automatiquement si le frontend lit le label depuis le backend ; sinon, mise à jour côté `NewsjackingPanel.tsx` à confirmer après lecture du composant.
