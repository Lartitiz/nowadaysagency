# Plan corrigé — Fix workspace leak Pinterest

## ⚠️ Désaccord d'analyse avec le prompt initial

Après lecture des 5 fichiers et de `_shared/user-context.ts`, je dois remonter **deux problèmes bloquants** dans le plan tel que rédigé. Je propose une version corrigée que tu valides avant exécution.

### Problème 1 — `ctx.profile?.user_id` est toujours `undefined`

Le `select` de `profiles` dans `getUserContext` (ligne 102 de `_shared/user-context.ts`) **ne contient pas la colonne `user_id`** :

```ts
supabase.from("profiles").select("prenom, activite, type_activite, cible, ...")
```

Conséquence : `ctx.profile?.user_id || user.id` retomberait **toujours** sur `user.id` → le bug serait silencieusement réintroduit. Le seul endroit où `getUserContext` connaît le `profileUserId` est une variable locale interne (lignes 45-56), non exposée dans le retour.

### Problème 2 — 4 des 5 « leaks » sont des faux positifs

Dans `pinterest-inspiration`, `pinterest-photo-brief`, `pinterest-visual`, `calendar-coaching`, le `.eq("user_id", user.id)` ligne 33/39 cible **la table `workspace_members` pour trouver le workspace owné par l'appelant** quand aucun `workspace_id` n'est passé dans la payload. Code (identique dans les 4) :

```ts
const { data: wsMember } = await sbAdmin
  .from("workspace_members")
  .select("workspace_id")
  .eq("user_id", user.id)        // ← ligne 33/39
  .eq("role", "owner")
  ...
const workspaceId = wsMember?.workspace_id;
```

Cette query répond à la question « quel workspace est owné par l'appelant authentifié ? » — c'est **délibéré et nécessaire**. La remplacer par `profileUserId` créerait une boucle logique impossible (on aurait besoin du `workspace_id` pour résoudre le `profileUserId`, qui sert à trouver le `workspace_id`).

→ Aucun risque de fuite ici : si l'appelant accède à un workspace via la payload, `filterWs = reqBody.workspace_id` court-circuite ce fallback, et `getUserContext(sbAdmin, user.id, filterWs)` est ensuite appelé avec le bon workspace.

### Vrai leak confirmé : `pinterest-ai/index.ts` uniquement

Lignes 98 et 105, on requête `pinterest_keywords` :
```ts
.eq("user_id", user.id)
```
Pour les actions `image-prompt` et `board-description`, si l'appelant accède au workspace de B, on ramène les keywords de A (le caller) au lieu de celles de B (le owner). C'est **le seul vrai leak** dans cette liste.

Bonus à corriger en même temps (déjà identifié dans le prompt) : ligne 67 retourne `status: 403` au lieu d'utiliser `quotaDeniedResponse`.

---

## Périmètre du plan corrigé

### (a) Ce que je te propose d'exécuter

**Un seul fichier modifié : `supabase/functions/pinterest-ai/index.ts`**

1. **Import (ligne 5)** : ajouter `quotaDeniedResponse` :
```ts
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
```

2. **Quota — checkQuota (ligne 63)** : passer `workspace_id` pour cohérence avec les autres fonctions Pinterest. Mais attention : `workspace_id` n'est destructuré qu'à la ligne 78 (après le check). Il faut soit déplacer le `await req.json()` avant, soit passer `workspace_id` en récupérant `reqBody` avant le check. Je propose de **déplacer `const reqBody = await req.json(); ... const { workspace_id } = reqBody;` AVANT le `checkQuota`** pour minimiser le changement.

3. **Quota — réponse (lignes 64-68)** : remplacer le `status: 403` manuel par :
```ts
if (!usageCheck.allowed) {
  return quotaDeniedResponse(usageCheck, corsHeaders);
}
```

4. **Résolution du `profileUserId`** : juste après le `getUserContext` (ligne 81), ajouter une résolution explicite via `workspace_members` (puisque `ctx` ne l'expose pas) :
```ts
let profileUserId = user.id;
if (workspace_id) {
  const { data: ownerRow } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspace_id)
    .eq("role", "owner")
    .maybeSingle();
  if (ownerRow?.user_id) profileUserId = ownerRow.user_id;
}
```

5. **Lignes 98 et 105** : remplacer `.eq("user_id", user.id)` par `.eq("user_id", profileUserId)`.

6. **`logUsage` (ligne 120)** : passer `workspace_id` pour cohérence multi-workspace :
```ts
await logUsage(user.id, "content", "pinterest", undefined, undefined, workspace_id);
```

### (b) Ce que je propose d'écarter du chantier

- **Aucune modification** sur `pinterest-inspiration`, `pinterest-photo-brief`, `pinterest-visual`, `calendar-coaching` : leur `.eq("user_id", user.id)` est un fallback légitime sur `workspace_members`, pas un leak.
- **Aucune modification** sur `_shared/user-context.ts` (hors scope explicite).

## Critères de validation

1. `deno check` sur `pinterest-ai/index.ts` → 0 erreur (les 16 erreurs préexistantes dans `_shared/scraping.ts` restent hors scope).
2. `rg -n '\.eq\("user_id", user\.id\)' supabase/functions/pinterest-ai/index.ts` → 0 résultat.
3. Test manuel : compte A manager du workspace de B, switch sur le workspace de B, génère via l'action `image-prompt` ou `board-description` → les `pinterest_keywords` retournées doivent être celles de B.

## Hors scope

- Refacto de `getUserContext` pour exposer `profileUserId` (serait plus propre mais touche un fichier partagé — chantier séparé si tu veux).
- Audit générique des autres Edge Functions pour des leaks similaires.
- Les 16 erreurs TS préexistantes dans `_shared/scraping.ts`.

---

## Question pour toi

**Tu veux que je parte sur cette version corrigée** (1 seul fichier modifié, vrai leak + bonus quota), ou **tu préfères qu'on fasse un chantier en 2 temps** :
- Étape 1 : exposer `profileUserId` dans le retour de `getUserContext` (modif partagée)
- Étape 2 : refactorer les 5 fichiers comme prévu initialement (mais en gardant les fallbacks `workspace_members` légitimes)

La V2 est plus propre mais touche un fichier partagé. Dis-moi.
