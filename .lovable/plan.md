

## Audit du bug — `Données invalides: context max 5000 ; recent_briefs_context max 4000`

### Reproduction du bug

Le bug se déclenche dans `generateQuestions` (front, `src/hooks/use-content-generator.ts`) lors d'un appel à l'edge function **`creative-flow`** avec `step: "questions"`. Pour un **reel**, le format n'a pas de mapping spécifique → on tombe par défaut sur `contentType: "instagram_post"` (ligne 520-525) et on envoie `context` + `recent_briefs_context` à `creative-flow`.

L'edge function `creative-flow` impose côté Zod (lignes 38-49) :
- `context` : **max 5000 caractères**
- `recent_briefs_context` : **max 4000 caractères**

Le client peut dépasser ces deux limites :

### Cause #1 — `context` peut dépasser 5000

```ts
context: effectiveSubjectQ + (existingContentQ ? `\n\n[Contenu existant à approfondir]\n${existingContentQ}` : "")
```

Quand on vient du **calendrier** avec un `existingCalendarContent` long (réécriture d'un post déjà rédigé), `subject` peut déjà valoir ~2000-3000 et `existingContent` plusieurs milliers de caractères → on franchit les 5000.

### Cause #2 — `recent_briefs_context` peut dépasser 4000 (le cas le plus probable pour le reel)

Construction front (lignes 442-459) :
- 3 briefs récents
- chaque brief = `Brief #N — sujet : "..." · format : ... · angle : ...` + `Réponse marquante : "..." (180 chars)`
- header + footer fixes (~250 chars)

Si l'utilisatrice a 3 briefs avec sujets longs (200-400 chars chacun, ce qui arrive vite quand le sujet vient d'une idée enrichie), et 3 réponses marquantes capées à 180 → on est à ~3 × (400 + 80 + 200) + headers ≈ **2000-3500**. **MAIS** : il n'y a actuellement **aucun cap final** sur `recentBriefsContext` côté front. Si un sujet est inhabituellement long (ex. titre de calendrier avec brief + variant), on dépasse 4000 sans avertissement.

Note : le helper serveur `_shared/recent-briefs.ts` (utilisé en fallback par creative-flow) ne cape pas non plus — donc même si le front omet le param, le serveur peut générer un blob > 4000 puis le valider lui-même… sauf que là il ne re-valide pas (il l'utilise directement). Le vrai problème est côté front : on l'envoie dans le body et il est validé par Zod.

### Cause #3 — Spécifique reel : `format: "reel"` n'est jamais explicitement géré dans `generateQuestions`

Pour un reel, le hook tombe dans le `else` générique (creative-flow + `contentType: "instagram_post"`). Pas de bug fonctionnel direct ici, mais c'est ambigu : on pose des questions "post Instagram" pour un reel. Hors scope du fix immédiat, mais à noter.

### Pourquoi ça frappe surtout les reels (constat utilisateur)

Hypothèse : les utilisatrices qui font des reels ont souvent rempli plusieurs briefs récents (le format reel est créé en série dans un même flow de réflexion). Donc `recent_briefs_context` est plus chargé sur ce parcours que sur d'autres. Combiné à un sujet enrichi (idée + contexte), on franchit le seuil.

### Plan de correction (3 fixes ciblés, faible risque)

1. **Caper `recentBriefsContext` côté front à 3800 caractères** (marge sous 4000) avec troncature propre — dans `use-content-generator.ts` après ligne 459. Idem dans `_shared/recent-briefs.ts` côté serveur pour cohérence.

2. **Caper `context` côté front à 4800 caractères** (marge sous 5000) — quand on concatène `effectiveSubjectQ + existingContentQ`, tronquer `existingContentQ` en priorité (le sujet doit rester intact). Ligne 526 de `use-content-generator.ts`.

3. **Améliorer le message d'erreur Zod côté `creative-flow`** : retourner un 400 lisible (déjà fait via `ValidationError`) — pas d'action nécessaire, juste vérifier que le toast front affiche un message gentil plutôt que le détail Zod brut.

### Hors scope

- Augmenter les limites Zod (5000 / 4000) → on garde les mêmes pour ne pas exploser les coûts de tokens.
- Refactor du mapping `format → contentType` pour les reels → autre sujet.
- Le helper serveur `getRecentBriefsContext` : on ajoute juste un cap, on ne touche pas à la logique.

### Fichiers à modifier

| Fichier | Changement | Lignes |
|---|---|---|
| `src/hooks/use-content-generator.ts` | Cap `recentBriefsContext` à 3800 + cap `context` à 4800 (tronquer `existingContentQ`) | ~459 et ~526 |
| `supabase/functions/_shared/recent-briefs.ts` | Cap final du blob retourné à 3800 | fin de la fonction |

### Validation

- `tsc --noEmit --skipLibCheck`
- Test manuel : créer un reel après avoir 3+ briefs récents avec sujets longs → questions doivent se générer sans 400.
- Smoke test curl `creative-flow` `step=questions` avec un context exact à la limite.

### Risque

Très faible : on ne change que la longueur des chaînes envoyées. La logique IA reste identique (on tronque rarement, et avec marge).

