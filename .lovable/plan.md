## Le problème

Ton métier (L'Assistant Com') porte sur la communication / les réseaux sociaux. Du coup, même quand tu cliques sur l'onglet **🌍 Globale** ou que tu écris "une actu qui a fait parler cette semaine, de manière globale", le système te renvoie quand même des actus *sur les réseaux sociaux* (ex : "Le scroll passif s'impose"). Vu de l'IA, c'est de la com' donc c'est ton univers : c'est bien ponté, donc c'est gardé.

Trois causes additionnent leurs effets dans l'edge function `newsjacking-ai` :

1. **Perplexity reçoit la niche en biais** — `fetchHotNews` est appelé avec `niche: nicheLabel` + les `universKeywords` issus du brand_universe. Sonar oriente ses actus chaudes vers ton métier, même quand l'intention est macro.
2. **Le garde-fou "pont explicite" force le retour à la niche** — chaque sujet, *même globale*, doit citer un élément littéral du profil (cible, activité, combat). Conséquence : l'IA garde en priorité les actus connectables au métier littéral, donc des actus sur la com'.
3. **L'intent custom n'est jamais traité comme un signal de "désancrage"** — le texte libre "actu globale qui a fait parler cette semaine" est passé tel quel à Claude, sans changer la pondération niche/globale ni détendre la règle du pont pour les sujets globaux.

## Ce que je propose de faire

### 1. Détecter un "intent macro" côté serveur

Dans `supabase/functions/newsjacking-ai/index.ts`, ajouter un détecteur simple sur `intentCustom` (regex sur des marqueurs comme : *globale, grand public, qui fait parler, dont tout le monde parle, hors de mon secteur, large, société, monde, semaine*). Si match → flag `macroMode = true`.

Le flag est aussi déclenchable depuis le frontend si la créatrice est sur l'onglet "🌍 Globale" au moment de relancer (cf. point 4).

### 2. Découpler Perplexity de la niche en mode macro

Quand `macroMode = true` :
- ne plus passer `niche` ni `universKeywords` à `fetchHotNews`
- bumper le nombre d'actus chaudes pré-sourcées de 3 à 5
- garder le filtre anti-faits divers / anti-partisan existant

### 3. Détendre le "pont" sur les actus globales en mode macro

Réécrire le bloc du prompt pour les actus de type `"globale"` quand `macroMode = true` :
- l'actu reste choisie pour sa *résonance grand public*, pas pour son pont au profil
- la "pertinence" devient une *piste de réaction* (en quoi cette créatrice peut avoir un angle dessus) plutôt qu'un pont littéral
- la règle de force_pont passe de "≥ 2/3 fort" à "≥ 1/3 fort", `fragile` reste interdit
- la cible visée passe à ~5 actus globales + 1 niche (au lieu de 3+3), pour matcher l'intention

### 4. Ajouter une règle anti-méta réseaux sociaux quand la niche EST les réseaux sociaux

Aujourd'hui l'interdit `🚫 Sujets qui parlent UNIQUEMENT de réseaux sociaux ou de création de contenu, sauf si c'est le métier de "${nicheLabel}"` s'auto-désactive pour toi. En mode macro, on inverse : *même si* c'est ton métier, les sujets "réseaux sociaux / création de contenu / Meta / Instagram / TikTok / publication" sont **exclus des actus globales** (ils peuvent toujours apparaître dans le bucket niche).

### 5. Passer le filtre UI au backend

Dans `src/components/creer/NewsjackingPanel.tsx`, quand `filter === "globale"` au moment de **Relancer**, envoyer dans le payload de l'edge function un flag `force_macro: true` qui active le mode macro côté serveur (en plus de la détection texte).

## Fichiers touchés

- `supabase/functions/newsjacking-ai/index.ts` — détection macro, appel Perplexity conditionnel, ajustement du systemPrompt (règles 1, 2, 3, 4)
- `supabase/functions/_shared/perplexity.ts` — pas de changement de signature, juste tolérer `niche` absent (déjà géré) et `universKeywords = []`
- `src/components/creer/NewsjackingPanel.tsx` — relais du flag `force_macro` quand l'onglet Globale est actif au lancement

## Hors scope (à confirmer si tu veux que je l'inclue)

- Modifier le composant des chips "vibes" pour proposer un vibe "📰 Actu grand public" explicite, qui équivaudrait à `force_macro = true` sans avoir à passer par l'onglet.
