## Diagnostic

Les logs de `newsjacking-ai` montrent la vraie cause du message "Pas d'actu choc trouvée" :

```
Perplexity (scoop): 0 actu(s) chaude(s) récupérée(s)
[perplexity] only 0 actu(s) après filtre, retry serré -5j
```

Perplexity ne renvoie **rien** en mode scoop. Sans actus chaudes pré-sourcées, Claude refuse poliment de proposer quoi que ce soit. Trois facteurs additionnés tuent le sourcing :

1. **`recency: "day"`** (forcé en mode scoop) combiné à un prompt très restrictif : Perplexity élimine la majorité des résultats avant même d'arriver chez nous.
2. **Filtre evergreen trop large** dans `_shared/perplexity.ts` : il blackliste "conférence", "table ronde", "polémique d'événement", "déclaration lors d'un colloque", etc. Or beaucoup d'actus chocs viennent justement de déclarations en conférence ou de prises de parole publiques.
3. **Filtre date strict** : si Perplexity oublie `date_publication` ou la met au mauvais format, l'actu est jetée. En mode "day" c'est presque systématique.
4. **Retry serré à -5j** : ne change pas le prompt ni la liste d'exclusions, donc échoue pour les mêmes raisons.

Résultat : `hotNews` est vide → le bloc "Actus chaudes pré-sourcées" envoyé à Claude est vide → Claude tombe dans son chemin "rien à dire".

## Plan

Tout se passe côté backend, deux fichiers seulement.

### 1. `supabase/functions/_shared/perplexity.ts` — assouplir en mode scoop

Ajouter un paramètre `mode?: "default" | "scoop"` à `fetchHotNews` qui modifie son comportement interne :

- **Recency** : forcer `"week"` même quand l'appelant demande `"day"`. La fenêtre date plancher reste à 10j (`search_after_date_filter`), donc on garde la fraîcheur sans étrangler Perplexity.
- **Prompt utilisateur dédié scoop** : remplacer la liste "INTERDIT" actuelle par une version allégée qui autorise déclarations publiques, polémiques de prise de parole, sorties médiatiques, classements/baromètres uniquement s'ils provoquent une réaction publique. On garde l'exclusion stricte sur : faits divers tragiques, politique partisane, replays/inscriptions webinaires, marketing pur.
- **Filtre evergreen contextuel** : en mode scoop, retirer du blacklist les patterns `conférence`, `masterclass`, `colloque`, `table ronde`, `événement`, `journées nationales`. Garder uniquement : webinaire/replay/inscription, save the date, billets en vente, palmarès/baromètre `\d{4}` annuel.
- **Tolérance date** : en mode scoop, si `date_publication` est absente OU illisible, **garder** l'actu au lieu de la jeter (sous condition : `source_url` présente). On loggue un warning.
- **Retry plus agressif** : si le premier appel renvoie < 2 actus en mode scoop, retry avec `recency: "month"` et fenêtre `-21j`, sur le **même** prompt allégé. Aujourd'hui le retry est inutile car il garde toutes les contraintes.

### 2. `supabase/functions/newsjacking-ai/index.ts` — passer le mode et augmenter le pool

- Ligne 293 : passer `mode: scoopMode ? "scoop" : "default"` à `fetchHotNews` et **laisser** `recency: "week"` (la fonction décidera en interne du retry month).
- Ligne 290–297 : augmenter le timeout `ppxController` de 25s → **40s** pour absorber le retry month.
- Après le sourcing : si `hotNews.length === 0` **et** `scoopMode === true`, logger explicitement `[scoop] sourcing vide après 2 tentatives` pour faciliter le debug futur.
- Bloc `scoopBlock` du system prompt : ajouter une porte de sortie — si la liste pré-sourcée est vide, **autoriser** Claude à utiliser sa propre web search (`site:lemonde.fr OR site:liberation.fr OR site:huffingtonpost.fr…`) pour ramener 2-3 sujets, au lieu de répondre vide. Aujourd'hui le bloc dit "puise EN PRIORITÉ" mais le fallback web search n'est pas explicite quand la liste est vide.

### 3. Vérification

Après déploiement :
- Tester `Actu choc à rebondir` côté UI.
- Vérifier les logs `newsjacking-ai` : on doit voir `Perplexity (scoop): N actu(s)` avec N ≥ 2 dans la majorité des cas.
- Si N reste à 0, le fallback Claude web search doit prendre le relais et ramener quelque chose au lieu du message "Pas d'actu choc".

## Fichiers touchés

- `supabase/functions/_shared/perplexity.ts` (nouveau paramètre `mode`, prompt scoop, filtre evergreen contextuel, retry month)
- `supabase/functions/newsjacking-ai/index.ts` (passage du mode, timeout, fallback web search dans `scoopBlock`)

Aucun changement DB, aucun changement UI.
