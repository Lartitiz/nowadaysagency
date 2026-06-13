## Résumé
Ajouter le garde workspace-guard (`assertWorkspaceMembership`) sur 2 Edge Functions détectées par le watchdog de sécurité : `content-coaching` et `audit-branding`. Le helper `_shared/workspace-guard.ts` existe déjà et n'est pas modifié.

## Fichiers impactés
1. `supabase/functions/content-coaching/index.ts`
2. `supabase/functions/audit-branding/index.ts`

## Implémentation

### Pour CHAQUE fichier :

(A) **Import** en tête (après les imports existants) :
```typescript
import { assertWorkspaceMembership, workspaceDeniedResponse } from "../_shared/workspace-guard.ts";
```

(B) **Garde** juste après la destructuration du `workspace_id` du body, et AVANT toute lecture/écriture scopée workspace :

**content-coaching** — après `const { answers, workspace_id, intensity, regenerate_lens } = body` (~L57), avant `const filterCol` (~L146).

**audit-branding** — après `const { ..., workspace_id, ... } = body` (~L117), avant `const filterCol` (~L120) / `getUserContext` / insert `branding_audits` (~L358).

```typescript
const sbGuard = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const membership = await assertWorkspaceMembership(sbGuard, user.id, workspace_id);
if (!membership.ok) {
  console.warn("[workspace-guard] denied", { userId: user.id, workspaceId: workspace_id });
  return workspaceDeniedResponse(corsHeaders);
}
```

## Ce qui NE bouge PAS
- Helper `workspace-guard.ts`, `getUserContext`, tous les gardes Vagues 1-5.
- Logique métier, prompts, appels Anthropic, quotas, inserts DB — strictement identique.
- Legacy (sans `workspace_id`) : inchangé (le helper retourne `ok: true` quand `workspace_id` est absent).
- Aucune autre Edge Function, aucun frontend.

## Validation
1. `npx tsc --noEmit --skipLibCheck` passe.
2. Fonctionnement normal sur workspace propre : identique.
3. Legacy (sans workspace_id) : identique.
4. Workspace étranger → 403 `workspace_access_denied`, aucune lecture/écriture cross-workspace.