## Plan Photo 1 — Fondations : `user_photos` + bucket Storage + quota `photo_retouch`

### Vérifications préalables (faites)

- `public.update_updated_at_column()` existe ✅
- `public.user_has_workspace_access(uuid)` existe ✅
- Pattern bucket privé `crosspost-uploads` confirmé (policies par dossier `auth.uid()`)
- `src/lib/plan-limits.ts` est le mirror frontend de `_shared/plan-limiter.ts` → devra être synchronisé aussi (sinon le tableau d'usage frontend ignorera la nouvelle catégorie)

---

### (a) Spec demandée — implémentation

**1. Migration SQL `[timestamp]_create_user_photos_table.sql`**

Table `public.user_photos` avec exactement les champs spécifiés :
- Obligatoires : `id`, `user_id`, `workspace_id` (FK `workspaces ON DELETE CASCADE`), `storage_path`, `original_storage_path`, `status` (CHECK pending/processing/ready/failed), `created_at`, `updated_at`
- Optionnels : `name`, `tags TEXT[]`, `background_prompt`, `background_preset_key`, `source_type` (CHECK upload/generated/imported, default `upload`), `width`, `height`, `file_size_bytes`, `error_message`

Index :
```sql
CREATE INDEX idx_user_photos_workspace ON public.user_photos(workspace_id, status) WHERE status = 'ready';
CREATE INDEX idx_user_photos_user ON public.user_photos(user_id);
CREATE INDEX idx_user_photos_tags ON public.user_photos USING GIN(tags);
```

Trigger `updated_at` réutilisant `public.update_updated_at_column()`.

RLS workspace-scoped (4 policies : SELECT/INSERT/UPDATE/DELETE) via `public.user_has_workspace_access(workspace_id)`.

Bucket privé :
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-photos', 'user-photos', false)
ON CONFLICT (id) DO NOTHING;
```

3 policies storage.objects :
- INSERT : dossier = `auth.uid()` (cohérent crosspost-uploads)
- SELECT : passage par `user_photos` + `user_has_workspace_access` (pour partage workspace multi-membres)
- DELETE : dossier = `auth.uid()`

Commentaires `COMMENT ON COLUMN` sur les 5 colonnes non-évidentes (storage_path, original_storage_path, source_type, background_preset_key, status).

**2. `supabase/functions/_shared/plan-limiter.ts`**

Ajout `photo_retouch` dans `PLAN_LIMITS` (free: 5, outil: 50, binome: 100) et dans `CATEGORY_LABELS` ("retouches photo").

---

### (b) Propositions d'amélioration — à valider individuellement

**Prop 1 — Synchroniser `src/lib/plan-limits.ts` (mirror frontend)** ⚠️ Recommandé fortement

Le fichier `src/lib/plan-limits.ts` mirrore manuellement `PLAN_LIMITS`. Sans synchro :
- Les UI qui affichent le quota restant (composants type "Tu as utilisé X/Y retouches photo") ne connaîtront pas la catégorie
- La constante `CATEGORIES` ne contiendra pas `photo_retouch`, ce qui peut casser des typages stricts

**Action proposée** : ajouter `photo_retouch` dans le tableau `CATEGORIES` et dans les 3 plans (mêmes valeurs que côté serveur). C'est strictement de la synchro, pas un changement de comportement.

**Prop 2 — Pas de contrainte CHECK sur `file_size_bytes`** ✅ Garder côté applicatif

Recommandation : ne PAS ajouter de CHECK DB. Justification :
- La limite Photoroom peut évoluer
- Une migration future serait pénible
- L'applicatif (Edge Function du Plan 2) doit rejeter avant upload, ce qui donne un meilleur message d'erreur

**Prop 3 — Pas de `deleted_at` (soft-delete)** ✅ Hard delete suffit pour la v1

Justification :
- Ajoute de la complexité partout (filtres `WHERE deleted_at IS NULL` dans toutes les queries)
- Le storage delete est de toute façon irréversible (coût €€)
- À ajouter en Phase 2 si retours utilisateur réels

**Prop 4 — Seuils quota (5/50/100)** ✅ Cohérents avec coût Photoroom (~$0.02/photo)

Coût max plan binôme : 100 × $0.02 = $2/utilisateur·ice/mois. Acceptable. Pas de changement proposé.

**Prop 5 — Ajout d'un CHECK `width > 0 AND height > 0` quand renseignés ?** ❌ Non recommandé

Les CHECK avec NULL sont passants par défaut, mais ça alourdit pour peu de valeur. L'Edge Function doit valider les dimensions de toute façon.

**Prop 6 — Index supplémentaire sur `(workspace_id, created_at DESC)` pour la liste de la bibliothèque** 🤔 Optionnel

L'index `idx_user_photos_workspace` couvre déjà `workspace_id` (partial sur `status='ready'`). Pour la liste paginée triée par date, un index dédié serait plus optimal. **Recommandation : attendre le Plan 3** (UI bibliothèque) pour mesurer si nécessaire avec EXPLAIN.

---

### Décisions à prendre avant exec

| # | Proposition | Action si OUI |
|---|---|---|
| 1 | Synchroniser `src/lib/plan-limits.ts` | Ajout 1 ligne dans `CATEGORIES` + 1 ligne dans chaque plan |
| 2 | CHECK file_size_bytes | Aucune (recommandation : SKIP) |
| 3 | soft-delete `deleted_at` | Aucune (recommandation : SKIP) |
| 4 | Revoir seuils quota | Spécifier les nouvelles valeurs |
| 5 | CHECK width/height > 0 | Aucune (recommandation : SKIP) |
| 6 | Index (workspace_id, created_at DESC) | Ajouter dans la migration |

**Mon avis** : ne valider que la **Prop 1** (sync mirror frontend, c'est de l'hygiène) et garder le reste pour Phase 2.

---

### Fichiers touchés (si Prop 1 acceptée)

**Création**
- `supabase/migrations/[timestamp]_create_user_photos_table.sql`

**Modification**
- `supabase/functions/_shared/plan-limiter.ts` — ajout `photo_retouch` dans `PLAN_LIMITS` (3 plans) + `CATEGORY_LABELS`
- `src/lib/plan-limits.ts` — ajout `photo_retouch` dans `CATEGORIES` + `PLAN_LIMITS` (3 plans + `free` qui contient déjà toutes les catégories à 60)

⚠️ Note sur `src/lib/plan-limits.ts` : le plan `free` du mirror frontend contient toutes les catégories à 60, mais `_shared/plan-limiter.ts` côté serveur n'a pas la même structure pour `free` (toutes à 60 aussi en réalité). On gardera la cohérence en mettant `photo_retouch: 5` côté serveur ET côté mirror (pas 60).

⚠️ Le mirror frontend a aussi un plan `pro` qui n'existe PAS côté serveur. Je le laisse tel quel (hors scope) mais signale qu'il est désynchronisé et devrait être nettoyé un jour.

---

### Hors scope (confirmé)

- Edge Function `photo-background-replace` (Plan 2)
- UI `/photos` (Plan 3)
- Intégration dans `CreerUnifie.tsx` (Plan 4)
- Presets de fond (Plan 5)
- Configuration secret `PHOTOROOM_API_KEY` (manuel)
- Régénération `src/integrations/supabase/types.ts` (auto au prochain code touch)

### Validation (après exec)

- Migration applique sans erreur
- `psql -c "SELECT * FROM public.user_photos LIMIT 0"` → schéma OK
- Bucket `user-photos` visible et `public=false`
- Test cascade : DELETE workspace → user_photos liées supprimées
- Test isolation RLS workspace
- Compilation TS sans erreur
