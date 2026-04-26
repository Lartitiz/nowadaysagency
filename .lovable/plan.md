## Plan — Fix workspace leak (Pinterest x4 + calendar-coaching)

### Diagnostic confirmé
J'ai relu les 5 fichiers et confirmé chaque leak. **MAIS j'ai aussi détecté un point bloquant dans la spec d'origine** que je signale avant d'exécuter (voir section "Point d'attention critique" ci-dessous).

| Fichier | Ligne(s) leak | Notes |
|---|---|---|
| `pinterest-ai/index.ts` | 98, 105 | + bonus 403→429 ligne 67 |
| `pinterest-inspiration/index.ts` | 39 (workspace_members) | leak mineur : sert juste à récupérer le workspace par défaut, **pas un vrai leak de données** |
| `pinterest-photo-brief/index.ts` | 39 (workspace_members) | idem |
| `pinterest-visual/index.ts` | 39 (workspace_members) | idem |
| `calendar-coaching/index.ts` | 33 (workspace_members) | idem |

### ⚠️ Point d'attention critique : la spec ne fonctionne pas telle quelle

La spec dit :
```ts
const profileUserId = ctx.profile?.user_id || user.id;
```

**Ça ne marche pas.** Le `select` fait par `getUserContext` sur la table `profiles` (ligne 102 de `_shared/user-context.ts`) ne contient PAS `user_id` :
```ts
.select("prenom, activite, type_activite, cible, ..., bio_cta_text")
```

Donc `ctx.profile?.user_id` sera **toujours `undefined`** → `profileUserId` retombera systématiquement sur `user.id` → **le bug ne sera pas corrigé**.

### Re-clarification du diagnostic ligne 39

Sur les 4 fichiers `pinterest-inspiration/photo-brief/visual` et `calendar-coaching`, la ligne 39 (`.eq("user_id", user.id)`) sert à récupérer le **workspace par défaut du caller** quand le client n'a pas envoyé `workspace_id` dans le body. C'est un comportement légitime : on cherche le workspace dont le caller est owner pour fallback. **Ça n'est pas un leak de données utilisatrice** — c'est juste un lookup de routing.

Le **seul vrai leak de données** est dans `pinterest-ai/index.ts` lignes 98 et 105 où on lit `pinterest_keywords` avec `user_id = user.id` au lieu du propriétaire du workspace en cours.

### Plan d'action proposé

J'ai 2 options à te soumettre. Choisis avant que j'exécute.

#### Option A (recommandée, 1 seul fichier modifié) — fix ciblé
Ne corriger que le **vrai leak** : `pinterest-ai/index.ts`.
1. Ajouter `quotaDeniedResponse` à l'import `_shared/plan-limiter.ts`
2. Remplacer la réponse 403 (ligne 64-68) par `return quotaDeniedResponse(usageCheck, corsHeaders);`
3. Passer `workspace_id` à `checkQuota(user.id, "content", workspace_id)` ligne 63
4. Après la ligne 81, résoudre le propriétaire du workspace via une query inline :
   ```ts
   let profileUserId = user.id;
   if (workspace_id) {
     const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
     const { data: ownerRow } = await sbAdmin.from("workspace_members")
       .select("user_id").eq("workspace_id", workspace_id).eq("role", "owner").maybeSingle();
     if (ownerRow?.user_id) profileUserId = ownerRow.user_id;
   }
   ```
5. Lignes 98 et 105 : `.eq("user_id", profileUserId)`
6. Passer `workspace_id` à `logUsage` ligne 120

Et **laisser tels quels** les 4 autres fichiers (les `.eq("user_id", user.id)` ligne 39 sont du lookup de fallback de workspace, pas du leak de données client·e).

#### Option B (spec d'origine adaptée, 6 fichiers modifiés) — fix exhaustif
Corriger les 5 fichiers + modifier `_shared/user-context.ts` pour qu'il expose `profileUserId` dans le retour de `getUserContext`. Ça permet au pattern `ctx.profileUserId` de fonctionner réellement et c'est plus propre à long terme. **Mais ça contredit la contrainte "Pas de modification de `_shared/user-context.ts`"** dans ta spec.

#### Option C — fix exhaustif sans toucher au shared
Corriger les 5 fichiers, et dans chacun ajouter le bloc `workspace_members` inline (duplication x5 de la résolution `profileUserId`). Respecte la contrainte mais duplique du code.

### Ma recommandation
**Option A**. Raison : le seul leak de données client·e est dans `pinterest-ai`. Les autres lignes 39 sont du routing, pas du leak. On évite 4 modifications inutiles et on garde le shared intact. Si tu confirmes que les 4 autres lignes 39 sont quand même à corriger pour une raison que je ne vois pas (ex: tu veux un comportement différent quand un manager appelle sans envoyer `workspace_id`), pars sur Option C.

### Ce qui ne bouge dans tous les cas
- `_shared/user-context.ts` (Options A et C)
- Les 3 Edge Functions hors scope (`audit-visual-templates`, `carousel-visual`, `invite-to-workspace`)
- Aucune migration SQL

### Critères de validation post-exec
1. `deno check` sur chaque fichier modifié → 0 erreur
2. `grep -n '.eq("user_id", user.id)' supabase/functions/pinterest-ai/index.ts` → 0 résultat (Option A)
3. Test manuel 2 comptes (toi + compte démo client·e) sur l'action `pinterest-ai board-description`

**Dis-moi quelle option tu valides** (A recommandée, B, ou C) avant que je passe en exécution.
