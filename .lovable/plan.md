# Cleanup — suppression de `checkAndIncrementUsage` (deprecated)

## Diagnostic

Vérification effectuée sur tout le repo :

```
rg -n "checkAndIncrementUsage" supabase/ src/
→ 1 seul résultat : la définition elle-même (plan-limiter.ts:300)
```

**Aucun appel** depuis aucune edge function ni le frontend. La fonction est strictement dead code, marquée `@deprecated` depuis sa réécriture (pattern obsolète : incrémente AVANT l'appel IA, donc décompte le crédit même si Anthropic échoue).

Risque actuel : un futur prompt pourrait la retrouver via auto-complétion ou recherche et la réutiliser → réintroduction du bug quota historique.

## Modification (1 seul fichier)

### `supabase/functions/_shared/plan-limiter.ts`

Supprimer **uniquement** les lignes 299-313 :

- Ligne 299 : `/** @deprecated Use checkQuota + logUsage instead */`
- Lignes 300-313 : tout le bloc `export async function checkAndIncrementUsage(...) { ... }`

Tout le reste du fichier est préservé à l'identique :
- `PLAN_LIMITS`, `PLAN_ALIASES`, `CATEGORY_LABELS`
- `resolvePlan`, `bestPlan`, `getMonthStart`, `getServiceClient`
- `getUserPlan`, `getWorkspacePlan`, `getBonusCredits`
- `quotaDeniedResponse`, `checkQuota`, `logUsage`
- L'interface `QuotaResult`

## Validation

Après suppression :

```bash
rg -n "checkAndIncrementUsage" supabase/ src/
→ doit retourner 0 résultat
```

Le fichier `plan-limiter.ts` doit toujours exporter exactement les mêmes symboles **moins** `checkAndIncrementUsage`.

## Note sur les build errors préexistants

Les erreurs TypeScript actuellement remontées (`_shared/scraping.ts`, `assistant-chat`, `analyze-brand`, etc.) **préexistent ce chantier** et concernent d'autres fichiers (problèmes de typage Deno : `DecompressionStream("raw")`, `Uint8Array<ArrayBufferLike>`, types Supabase `never`). Elles avaient déjà été identifiées comme "non liées" dans une session précédente. La suppression de `checkAndIncrementUsage` ne les touche pas et n'en crée pas de nouvelles.

→ Le critère "tsc 0 erreur global" ne sera pas atteint, mais le fichier `plan-limiter.ts` lui-même compile proprement après suppression.

## Hors scope (respecté)

- ❌ Pas de touche aux autres exports de `plan-limiter.ts`
- ❌ Pas de migration Supabase
- ❌ Pas de refacto
- ❌ Pas de fix des build errors préexistants (un autre chantier)

## (b) Propositions de cleanup additionnel — pour validation séparée

Recherche `@deprecated` sur tout `supabase/functions/` :

```
rg -n "@deprecated" supabase/functions/
→ 1 seul résultat : celui qu'on supprime
```

**Aucun autre `@deprecated` à signaler** dans les edge functions. Le repo est propre de ce côté-là.

Si tu veux pousser le cleanup plus loin (autre chantier), les pistes seraient :
- Auditer les fonctions exportées de `_shared/` jamais importées (dead code non taggé)
- Auditer les imports inutilisés dans les edge functions actives

Mais rien de signalé comme `@deprecated` aujourd'hui à part la cible de ce chantier.
