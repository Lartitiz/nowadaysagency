## (a) Ce que tu m'as demandé

### Pattern commun (3 composants)

Import :
```ts
import { handleQuotaError } from "@/lib/quota-error-handler";
```

Juste après l'appel `invokeWithTimeout` et AVANT le traitement d'erreur existant, insérer une garde quota :
```ts
if (error?.isRateLimit || data?.error === "limit_reached") {
  if (handleQuotaError({ message: error?.message || data?.message, data })) {
    return; // setLoading/setGenerating → géré par le finally
  }
}
```
→ Si `handleQuotaError` ouvre le QuotaWallModal (return true), on coupe net SANS afficher le toast générique. Sinon, le flow d'erreur actuel reprend la main inchangé.

### 1. `src/components/ContentRecycling.tsx` — `handleRecycle`
- Ajout import `handleQuotaError`.
- Insertion de la garde quota juste après `const { data, error } = await invokeWithTimeout(...)` (ligne ~147), AVANT le `if (error) throw ...` et AVANT la garde "results vide" déjà en place.
- Le `setLoading(false)` est déjà dans le `finally` (patch précédent) → `return` propre.

### 2. `src/components/CrosspostFlow.tsx` — `generate`
- Ajout import `handleQuotaError`.
- L'appel actuel est `const res = await invokeWithTimeout("linkedin-ai", ...)`. On le destructure pour avoir accès séparé à `data`/`error` :
  ```ts
  const { data: cpData, error: cpError } = await invokeWithTimeout("linkedin-ai", { body: {...} }, 120000);
  if (cpError?.isRateLimit || cpData?.error === "limit_reached") {
    if (handleQuotaError({ message: cpError?.message || cpData?.message, data: cpData })) {
      return;
    }
  }
  if (cpError) throw new Error(cpError.message);
  let parsed: CrosspostResult = parseAIResponse(cpData?.content || "");
  ```
- Le `finally` existant gère `setGenerating(false)` + cleanup des fichiers uploadés. Le `return` passe par le `finally` → cleanup OK.

### 3. `src/components/InspireFlow.tsx` — `analyze`
- Ajout import `handleQuotaError`.
- Insertion de la garde quota juste après la ligne 174 (`const { data, error } = await invokeWithTimeout("inspire-ai", ...)`), AVANT le `if (error || data?.error)` actuel.
- **Bonus demandé** : corriger les deps du `useCallback` ligne 202 :
  ```ts
  }, [user, sourceText, sourceUrl, tab, files, screenshotContext, workspaceId]);
  ```
- Le `setLoading(false)` est dans le `finally` → `return` propre.

## (b) Propositions d'amélioration connexes

- **B1 — Inclure `sourceContent` dans la garde Crosspost si l'edge function renvoie un format différent** : non, le contrat est uniforme côté backend (limit_reached / message). Aucun changement nécessaire.
- **B2 — Factoriser le pattern en helper `isQuotaResponse(error, data)`** dans `quota-error-handler.ts` : tentant, mais hors scope (toucherait `use-content-generator.ts`). À déclencher dans un chantier séparé si tu veux. **NON recommandé maintenant.**
- **B3 — Vérifier que `registerQuotaWallCallback` est bien appelé au montage de l'app** : déjà fait ailleurs sinon `use-content-generator` ne marcherait pas → rien à toucher.

## Critères de validation

- `npx tsc --noEmit --skipLibCheck` passe
- Compte free à 0 crédit sur chacun des 3 modes → QuotaWallModal s'ouvre, pas de toast "Erreur"
- Compte avec crédits : génération normale dans les 3 modes
- Lint hook deps : warning `react-hooks/exhaustive-deps` disparu sur `analyze` d'InspireFlow

Dis-moi si je peux build, et si tu veux que je tente B2 en parallèle ou pas.