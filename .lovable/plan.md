# Plan — Hygiène quota `engagement-coaching`

## Objectif

Aligner `engagement-coaching` sur le standard quota du repo (déjà appliqué à `audit-instagram-ai`) pour que la `QuotaWallModal` côté front se déclenche correctement, et que les workspaces partagés soient correctement comptabilisés.

## Fichier impacté

**Un seul fichier** : `supabase/functions/engagement-coaching/index.ts`

## Modifications

### 1. Import (ligne 8)

Ajouter `quotaDeniedResponse` :

```ts
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
```

### 2. `checkQuota` (ligne 40) — passer `workspace_id`

```ts
const limitCheck = await checkQuota(userId, "coach", workspace_id);
```

### 3. Réponse quota dénié (ligne 41) — passer de 403 manuel à `quotaDeniedResponse` (qui retourne 429 + payload structuré)

```ts
if (!limitCheck.allowed) return quotaDeniedResponse(limitCheck, cors);
```

### 4. `logUsage` (ligne 100) — passer `workspace_id` en dernier argument

```ts
await logUsage(userId, "coach", "engagement_coaching", undefined, undefined, workspace_id);
```

## État actuel confirmé (via grep)

- L8 : `import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";`
- L40 : `const limitCheck = await checkQuota(userId, "coach");`
- L41 : `if (!limitCheck.allowed) return new Response(JSON.stringify({ error: limitCheck.message }), { status: 403, headers: cors });`
- L100 : `await logUsage(userId, "coach", "engagement_coaching");`

## Hors scope (intact)

- Tout le reste du fichier (system prompt, user prompt, parsing JSON, gestion erreurs)
- `_shared/plan-limiter.ts` (la fonction `quotaDeniedResponse` existe déjà)
- Toute autre Edge Function

## Déploiement

Re-déployer `engagement-coaching` après modification.

## Validation

1. Le fichier compile (`deno check`).
2. Côté front, épuiser quota `coach` d'un compte free puis appeler engagement-coaching → la `QuotaWallModal` s'affiche (status 429 reconnu par `quota-error-handler`).
3. Vérifier en DB que `ai_usage` contient bien `workspace_id` après un appel réussi depuis un workspace partagé.

## Propositions de cleanup (hors scope, pour validation séparée)

Audit rapide à faire dans un prochain chantier : les autres Edge Functions qui retournent un `403` quota manuel au lieu de `quotaDeniedResponse`, et celles qui omettent `workspace_id` dans `checkQuota`/`logUsage`. Je peux faire le grep et te lister les candidates si tu veux lancer un chantier d'harmonisation globale.
