# Plan — Helper `workspace-guard` + application sur `assistant-chat`

Périmètre strict : Vague 1 uniquement. Backend, deux fichiers.

---

## (a) Ce que tu m'as demandé

### 1. Nouveau fichier `supabase/functions/_shared/workspace-guard.ts`

Deux exports, pas de client Supabase créé en interne, pas de dépendance autre que `./cors.ts` pour le typage des headers.

```ts
// supabase/functions/_shared/workspace-guard.ts

export type WorkspaceGuardResult =
  | { ok: true; role: string }
  | { ok: false; status: number };

/**
 * Vérifie que `userId` est membre de `workspaceId`.
 * - workspaceId null/undefined  -> { ok: true, role: "legacy" }  (mode mono-user préservé)
 * - membre trouvé               -> { ok: true, role: <role DB> }
 * - non membre / erreur lecture -> { ok: false, status: 403 }
 *
 * `sb` doit être un client SERVICE_ROLE déjà instancié par l'appelant.
 */
export async function assertWorkspaceMembership(
  sb: any,
  userId: string,
  workspaceId: string | null | undefined,
): Promise<WorkspaceGuardResult> {
  if (!workspaceId) return { ok: true, role: "legacy" };

  const { data, error } = await sb
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return { ok: false, status: 403 };
  return { ok: true, role: data.role };
}

export function workspaceDeniedResponse(
  corsHeaders: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      error: "workspace_access_denied",
      message: "Tu n'as pas accès à cet espace.",
    }),
    {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
```

Notes :

- Retour `{ ok: true, role }` conforme à ta décision. `assistant-chat` ignorera `role`.
- En mode legacy (pas de `workspace_id`), `role: "legacy"` sert de marqueur explicite sans casser le typage et sans introduire de nouveau type.
- Aucune logique de branchement par rôle dans le helper — strictement binaire.

### 2. Patch `supabase/functions/assistant-chat/index.ts`

Deux changements minimaux :

**a. Imports (en tête de fichier, après les imports existants)**

```ts
import {
  assertWorkspaceMembership,
  workspaceDeniedResponse,
} from "../_shared/workspace-guard.ts";
```

**b. Insertion du garde juste après `const sb = getServiceClient();` (ligne 326), AVANT la résolution de `profileUserId**`

```ts
const sb = getServiceClient();

const membership = await assertWorkspaceMembership(sb, userId, workspace_id);
if (!membership.ok) {
  return workspaceDeniedResponse(cors);
}

// Resolve workspace owner's user_id for profile-scoped tables
let profileUserId = userId;
...
```

Tout le reste du handler (résolution `profileUserId`, `undo`, `confirmed_actions`, quota, `getUserContext`, prompt système, `executeActions`, rate limiting) reste **strictement identique**.

---

## (b) Mes propositions d'amélioration (à valider individuellement)

### P1 — Mutualiser la résolution de `profileUserId` dans le helper

**Refusé par défaut.** Le plan dit explicitement « on AJOUTE un garde en amont, on ne refactore rien ». Mutualiser ferait deux choses dans un seul helper et sortirait du périmètre. Je ne le propose que pour mémoire — à traiter dans un plan dédié si tu le souhaites un jour.

### P2 — Log console des refus

Ajouter, dans `workspaceDeniedResponse` ou côté appelant, un `console.warn("[workspace-guard] denied", { userId, workspaceId })` pour tracer les tentatives suspectes dans les logs Edge.

- **Coût** : 1 ligne.
- **Bénéfice** : audit a posteriori, détection d'abus.
- **Risque** : log de `userId` (UUID, déjà partout dans nos logs Edge) — pas de donnée sensible.

Si tu acceptes, je place le `console.warn` dans `assistant-chat` au moment du `return`, pas dans le helper (le helper reste pur, sans effet de bord).

### P3 — Distinguer `403` (non-membre) et `404` (workspace inexistant)

Aujourd'hui, on renvoie `403` dans les deux cas. C'est volontaire pour éviter l'énumération d'IDs (pattern sécu standard). **Je recommande de garder 403 dans tous les cas** et ne propose pas de changement — juste à acter.

### P4 — Petit test Deno pour le helper

Créer `supabase/functions/_shared/workspace-guard_test.ts` avec un mock `sb` (objet qui retourne `{ data, error }` selon la chaîne `.from().select().eq().eq().maybeSingle()`).

- **Coût** : ~40 lignes.
- **Bénéfice** : régression évitée quand les 16 autres fonctions s'y brancheront.
- **Risque** : aucun.

---

## Critères de validation (rappel)

1. `npx tsc --noEmit --skipLibCheck` passe.
2. Utilisateur·ice sur son propre workspace : assistant identique à aujourd'hui.
3. Appel sans `workspace_id` : identique à aujourd'hui.
4. Appel avec `workspace_id` d'un autre user : `403 workspace_access_denied`, aucune écriture.

---

## Hors scope (rappel)

Vagues 2/3/4 traitées dans des plans ultérieurs. Aucune autre Edge Function, aucun fichier frontend touché ici.

---

**Avant d'exécuter, dis-moi pour P2 et P4 : oui / non / l'un seulement.** P1 et P3 sont déjà tranchés (non / garder 403). Plan validé, tu peux passer en Exec.

Décisions sur tes propositions :

- **P2 : oui.** Place le `console.warn("[workspace-guard] denied", { userId, workspaceId })` côté assistant-chat au moment du `return`, pas dans le helper (helper pur).
- **P4 : oui.** Crée le test. Il sera intégré à ma routine de validation via `deno test`.
- **P1 : non** (hors périmètre, plan dédié plus tard).
- **P3 : garder 403 dans tous les cas** (acté, anti-énumération).

Exécute les deux fichiers + le test. Rappel des contraintes : tout le reste du handler assistant-chat reste strictement identique, aucune autre Edge Function touchée, aucun fichier frontend.