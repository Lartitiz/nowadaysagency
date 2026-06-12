Périmètre : backend, 4 fichiers Edge Function. Helper `_shared/workspace-guard.ts` consommé, non modifié.

## Contexte

Ces 4 fonctions résolvent `workspace_id` depuis le body sans vérifier l'appartenance. On pose un garde uniforme (même pattern que Vagues 1-3) qui bloque en 403 si l'utilisateur·ice n'est pas membre du workspace passé.

## Changements par fichier

### 1. `supabase/functions/ai-text-action/index.ts`

- **Import** : ajouter `assertWorkspaceMembership` et `workspaceDeniedResponse` depuis `../_shared/workspace-guard.ts`.
- **Garde** : après le parsing du body (`const { workspace_id, … } = await req.json()`, L18-23) et AVANT `checkQuota` (L25) :
  - Instancier `sbGuard` avec `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`.
  - `const membership = await assertWorkspaceMembership(sbGuard, userId, workspace_id);`
  - Si `!membership.ok`, `console.warn("[workspace-guard] denied", …)` puis `return workspaceDeniedResponse(corsHeaders);`.
- **Résultat** : `checkQuota` et la lecture `brand_profile` se déroulent uniquement si membre ou mode legacy (pas de `workspace_id` dans le body).

### 2. `supabase/functions/coaching-module/index.ts`

- **Import** : idem.
- **Garde** : après le destructuring du body (`const { … workspace_id } = body`, L86) et la validation `module/phase` (L88-92), AVANT `checkQuota` (L96) :
  - `sbGuard` dédié.
  - `assertWorkspaceMembership(sbGuard, user.id, workspace_id)`.
  - 403 + log si refusé.
- **Résultat** : la lecture parallèle `brand_profile` + `branding_audits` + `audit_recommendations` (L104+) protégée.

### 3. `supabase/functions/branding-mirror/index.ts`

- **Import** : idem.
- **Garde** : après `workspace_id = body?.workspace_id` (L41) et AVANT `checkQuota` (L45) :
  - `sbGuard` dédié.
  - `assertWorkspaceMembership(sbGuard, user.id, workspace_id)`.
  - 403 + log si refusé.
- **Résultat** : le bloc owner-resolve (L55-68) et les lectures `brand_profile` / `branding_audits` / `calendar_posts` (L71+) protégées.

### 4. `supabase/functions/charter-coaching/index.ts`

- **Import** : idem.
- **Garde** : après `const userId = user.id` (L243) et AVANT le bloc `if (workspace_id) { … owner-resolve … }` (L249) :
  - `sbGuard` dédié.
  - `assertWorkspaceMembership(sbGuard, userId, workspace_id)`.
  - 403 + log si refusé.
- **Résultat** : le owner-resolve (L249-262), le `checkQuota` (L265), et les lectures `profiles` / `brand_profile` (L274+) protégées.

## Règles du pattern

- `sbGuard` est systématiquement un **nouveau** `createClient` (service_role), pas un client existant réutilisé.
- `corsHeaders` est déjà en portée dans les 4 fichiers ; `workspaceDeniedResponse(corsHeaders)` s'utilise tel quel.
- Si `workspace_id` est absent du body, `assertWorkspaceMembership` retourne `{ ok: true, role: "legacy" }` → comportement inchangé.
- Aucune logique métier ne bouge : prompts, appels Anthropic, quotas, lectures DB, `logUsage`, réponses — strictement identique.

## Proposition d'amélioration repérée (hors scope demandé)

- Dans `branding-mirror` et `charter-coaching`, le bloc `owner-resolve` (query `workspace_members` pour trouver le owner) pourrait être unifié dans un helper futur. Pas de changement dans ce lot.

## Validation

1. `npx tsc --noEmit --skipLibCheck` passe sans erreur.
2. Sur le propre workspace de l'utilisateur·ice : comportement identique.
3. En mode legacy (aucun `workspace_id` dans le body) : comportement identique.
4. Workspace d'un·e autre → 403 `workspace_access_denied`, log `[workspace-guard] denied`, aucune donnée branding lue. Plan 5A validé, tu peux passer en Exec.
  Bon réflexe d'avoir placé le garde avant `checkQuota` partout — on garde ça.
  Ta proposition (b) (helper owner-resolve unifié) : notée pour plus tard, hors scope ici, on n'y touche pas.
  Rappels : `sbGuard` dédié partout (pas de réutilisation), `membership.ok` uniquement, aucune logique métier touchée, helper non modifié, et surtout **uniquement ces 4 fichiers** — pas les 4 du lot 5B.
  Exécute les 4.