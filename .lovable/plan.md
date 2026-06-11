# Vague 2 — workspace-guard sur 5 Edge Functions d'écriture

Pattern unique appliqué à 5 fichiers : import du helper + insertion d'`assertWorkspaceMembership` au point indiqué. Aucune autre modification.

## (a) Modifications demandées

Dans CHAQUE fichier :

**Import à ajouter** (après les imports existants) :

```ts
import { assertWorkspaceMembership, workspaceDeniedResponse } from "../_shared/workspace-guard.ts";
```

**Bloc à insérer** au point précisé :

```ts
const membership = await assertWorkspaceMembership(<CLIENT>, <USER>, <WS_BODY>);
if (!membership.ok) {
  console.warn("[workspace-guard] denied", { userId: <USER>, workspaceId: <WS_BODY> });
  return workspaceDeniedResponse(corsHeaders);
}
```

### 1. `analyze-brand/index.ts`

- Client : `supabaseAdmin` · User : `userId` · WS : `bodyWorkspaceId`
- Insertion : **après la création de `supabaseAdmin` (L38-41)**, juste avant `const scrapedContent` (L43).

### 2. `analyze-branding-impact/index.ts`

- Client : `supabase` · User : `user.id` · WS : `workspace_id`
- Insertion : **après le `req.json()` qui lit `workspace_id` (L28) et avant `checkQuota` (L34)** — au plus tôt après L31 (le early-return si champs manquants). On le place juste avant le commentaire `// Check quota` (L33).

### 3. `deep-diagnostic/index.ts`

- Client : `supabaseAdmin` · User : `userId` · WS : `bodyWorkspaceId`
- Insertion : **après la création de `supabaseAdmin` (L80-83)**, juste avant le commentaire `// Get workspace` (L85) et la requête `wsData`.

### 4. `generate-branding-summary/index.ts`

- Le fichier crée ses clients SERVICE_ROLE inline. Instancier un client local dédié au garde, juste avant l'appel :

```ts
const sbGuard = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const membership = await assertWorkspaceMembership(sbGuard, user.id, workspace_id);
if (!membership.ok) { ... return workspaceDeniedResponse(corsHeaders); }
```

- Insertion : **après la destructuration `{ force, workspace_id }` (L42)**, avant `const filterCol` (L44).
- Pas de refactor des autres `createClient` inline.

### 5. `generate-voice-guide/index.ts`

- Client : `serviceClient` · User : `userId` · WS : `workspace_id`
- Insertion : **après la création de `serviceClient` (L50)**, avant `getUserContext` (L51).

## Garanties

- `membership.ok` uniquement utilisé (le helper hardcode 403).
- `bodyWorkspaceId`/`workspace_id` absent → helper retourne `ok: true` (legacy) → comportement inchangé.
- Aucun fichier touché en dehors des 5. Helper `_shared/workspace-guard.ts` non modifié. `assistant-chat` non retouché.
- Aucune modification de logique métier, prompts, scraping, quotas, contextes, fallbacks `wsData`, profileUserId.

## (b) Propositions hors demande

Lecture des 5 fichiers : les points d'insertion proposés sont les plus précoces possibles SANS toucher au flux. À noter pour transparence (pas d'action requise) :

- `**analyze-brand**` : `checkQuota` (L30) est appelé AVANT `supabaseAdmin` (L38) mais ne prend pas `workspace_id` en argument → aucun risque d'écriture/lecture scoping workspace avant le garde. Le point d'insertion L41 reste le plus sûr (premier moment où un client SERVICE_ROLE existe).
- `**analyze-branding-impact**` : le early-return L29-31 (champs manquants) reste légitimement avant le garde car il n'utilise aucune donnée workspace. OK.
- `**deep-diagnostic**` : `checkQuota` (situé plus bas dans le fichier, hors extrait) doit déjà être après L83. Le garde inséré à L84 protège bien `wsData` et toute la suite.

Aucune amélioration nécessaire au-delà de ces observations.

## Validation

- `npx tsc --noEmit --skipLibCheck` → 0 erreur
- 5 fonctions appelées sur propre workspace : OK
- 5 fonctions appelées sans `workspace_id` : OK (legacy)
- 5 fonctions appelées avec workspace_id étranger : 403 `workspace_access_denied`, log `[workspace-guard] denied` 

Plan validé, tu peux passer en Exec.

Tes observations en (b) sont justes et j'ai vérifié deep-diagnostic : la première opération workspace y est la requête `wsData` (L87), suivie du `checkQuota` scopé workspace (L110) puis des écritures. Le garde à L84 précède bien tout. Parfait.

Rappel des contraintes pour les 5 fichiers :

- Garder sur la valeur **brute du body** (`bodyWorkspaceId` pour analyze-brand/deep-diagnostic, `workspace_id` pour les 3 autres), jamais sur un workspace calculé.
- `membership.ok` uniquement.
- Aucune logique métier touchée, fallbacks `wsData` et `profileUserId` intacts.
- Aucun fichier hors les 5, helper non modifié, assistant-chat non retouché.

Exécute les 5.