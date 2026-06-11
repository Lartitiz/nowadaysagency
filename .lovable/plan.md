# Audit — Idées sauvegardées qui disparaissent

## Diagnostic

J'ai audité tous les points d'insertion dans `saved_ideas` et la lecture côté `IdeasPage` / hook `useSavedIdeas`. La règle attendue (convention du projet) :

- À l'insert : `workspace_id: workspaceId !== user.id ? workspaceId : undefined` + `user_id: user.id`.
- À la lecture : `useWorkspaceFilter()` filtre par `workspace_id = activeWorkspace.id` quand un workspace est actif, sinon par `user_id = user.id`.

**Quand un workspace est actif (cas par défaut dès qu'on a un workspace owner), la liste filtre par `workspace_id`. Toute idée insérée avec `workspace_id = NULL` est invisible.**

### Bugs trouvés

1. **`SaveToIdeasDialog`** (utilisé depuis les pages de contenu, source_module `content-actions`) — l'insert **ne passe pas du tout `workspace_id`** → la ligne est créée avec `workspace_id = NULL` → invisible dans `/idees`. **C'est la cause principale rapportée par ta cliente.**

2. **`ContentCoachingDialog`** — insère `workspace_id: workspaceId` sans le guard `!== user.id`. Fonctionnellement visible (parce que `useWorkspaceFilter` retombe sur `user_id` quand il n'y a pas de workspace), mais pollue les données (workspace_id = user.id, qui n'est pas un workspace réel). À aligner sur la convention.

3. **`AdaptiveHome` (compteur "Idées sauvegardées" sur le home)** — la requête fait `.eq("user_id", user.id).eq("workspace_id", workspaceId ?? user.id)`. Elle exige les **deux** colonnes simultanément, donc :
   - les lignes `workspace_id = NULL` ne sont jamais comptées,
   - une idée créée dans un workspace n'est pas comptée dans un autre workspace.
   À aligner sur `useWorkspaceFilter` (un seul filtre, selon le mode).

4. **`IdeasPage.fetchIdeas`** — le `useEffect` dépend uniquement de `user?.id`, pas de `column`/`value`. Si le workspace actif change (ou se résout après le mount), la liste ne se refetch pas.

### Confirmation côté DB

Sur les 37 lignes existantes : **7 ont `workspace_id = NULL`** — 6 viennent de `source_module = content-actions` (ta cliente + 1 autre user), 1 d'une source legacy. Ce sont exactement les idées « perdues ».

## Plan de correction

### 1. Frontend — sauvegardes manquantes ou incohérentes
- `src/components/SaveToIdeasDialog.tsx` : récupérer `workspaceId` via `useWorkspaceId()` et ajouter `workspace_id: workspaceId !== user.id ? workspaceId : undefined` à l'insert.
- `src/components/dashboard/ContentCoachingDialog.tsx` : appliquer le même guard `!== user.id ? : undefined` dans `handleSaveIdea` au lieu de passer `workspaceId` brut.

### 2. Frontend — lecture / comptage
- `src/pages/AdaptiveHome.tsx` (requête `adaptive-home-ideas-count`) : remplacer le double `.eq("user_id").eq("workspace_id")` par un filtre unique cohérent avec `useWorkspaceFilter` (workspace_id si activeWorkspace, sinon user_id).
- `src/pages/IdeasPage.tsx` : étendre les deps du `useEffect` à `[user?.id, column, value]` pour refetch quand le workspace résout/change.

### 3. Backfill DB — récupérer les idées perdues de ta cliente
Migration qui, pour chaque ligne `saved_ideas` avec `workspace_id IS NULL`, met `workspace_id = public.get_user_owner_workspace(user_id)` (uniquement quand un workspace owner existe). Cela rendra immédiatement visibles les 7 lignes orphelines dans `/idees` sans toucher au reste.

```sql
UPDATE public.saved_ideas si
SET workspace_id = public.get_user_owner_workspace(si.user_id)
WHERE si.workspace_id IS NULL
  AND public.get_user_owner_workspace(si.user_id) IS NOT NULL;
```

## Hors scope

- Audit des autres tables avec patron similaire (`content_briefs`, etc.) — peut être un sprint séparé si tu veux un balayage global.
- Refactor pour centraliser un helper `getWorkspaceInsertPayload()` partagé entre tous les call-sites (utile mais plus large).

## Validation

- `npx tsc --noEmit` clean.
- Manuel : depuis une page de contenu, cliquer "Sauvegarder dans mes idées" (flow SaveToIdeasDialog) → ouvrir `/idees` → l'idée apparaît immédiatement.
- DB : `SELECT count(*) FROM saved_ideas WHERE workspace_id IS NULL` = 0 (ou seulement les users sans workspace owner).
- Côté ta cliente : ses 6 idées orphelines réapparaissent dans `/idees` après la migration.
