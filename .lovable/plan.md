

## Fix — Bug TDZ dans `branding-coaching` (coaching IA séries cassé)

### Diagnostic

Erreur runtime : `ReferenceError: Cannot access 'parsed' before initialization at index.ts:787:41`.

Cause exacte : dans `supabase/functions/branding-coaching/index.ts`, le bloc de validation Zod du `series[]` (lignes 684-710) référence `parsed` alors que la variable n'est déclarée qu'à la ligne 741 (`let parsed;`). En JavaScript/TS, les `let` ne sont pas hoistées comme les `var` → erreur Temporal Dead Zone dès qu'on hit ce code path. Comme la condition ligne 685 court-circuite via optional chaining (`parsed?.extracted_insights?.series`), elle ne crashe pas immédiatement, mais dès que `parsed` est utilisé sans optional chaining (ligne 781 `parsed.covered_topic`), tout le scope se bloque.

Ce bloc a clairement été inséré au mauvais endroit lors du Plan 2 (truncation séries à 8 + validation shape).

### Correction

**Un seul fichier** : `supabase/functions/branding-coaching/index.ts`

1. **Supprimer** le bloc lignes 683-710 (commentaire + condition `if (section === "content_series" && parsed?.extracted_insights?.series ...)`).

2. **Réinsérer le même bloc** juste après le bloc de parsing (après ligne 776, donc avant le filet de sécurité ligne 778) — à ce moment, `parsed` est garanti d'être initialisé (soit via `JSON.parse`, soit via le fallback `parsed = { question: ... }`).

Ordre final attendu dans le fichier :
```
1. Récupération rawResponse
2. let parsed; + try/catch JSON.parse → parsed initialisé
3. [NOUVEAU] Validation/truncation series[] (ex-684-710)
4. Filet de sécurité is_complete
5. Normalize covered_topic
6. logUsage + return
```

### Validation

- Compile TypeScript Deno OK
- Test manuel : lancer le coaching `content_series` → la première question s'affiche sans erreur 500
- Test régression : autres sections (`story`, `persona`, `content_strategy`) continuent de fonctionner
- Logs edge function : plus de `ReferenceError: Cannot access 'parsed' before initialization`

### Hors scope

- Aucune modif du frontend (`BrandingCoachingFlow.tsx`)
- Aucune modif de la validation Zod elle-même (juste son placement)
- Aucune migration DB

