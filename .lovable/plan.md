
# Fix : "Impossible de retrouver ma ligne éditoriale"

## Diagnostic

Le problème vient de **lignes dupliquées** dans la table `brand_strategy`. Plusieurs endroits du code (onboarding, diagnostic, coaching, import) insèrent des lignes au lieu de mettre à jour l'existante. Quand il y a plusieurs lignes pour le même user/workspace, la requête `.maybeSingle()` échoue silencieusement et retourne `null` → la page affiche "vide" alors que les données existent.

Exemple concret : un utilisateur a **10 lignes** dans `brand_strategy`, dont 9 sans `workspace_id`.

## Plan de correction

### 1. Migration SQL : dédupliquer et ajouter une contrainte unique

- Supprimer les doublons en gardant la ligne la plus récente (avec le plus de données) par combinaison `(user_id, workspace_id)`
- Ajouter une contrainte `UNIQUE` sur `(user_id, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'))` pour empêcher les futurs doublons

### 2. Corriger `BrandingCoachingFlow.tsx` — saveInsights pour content_strategy

Remplacer le pattern `maybeSingle()` par `.order("updated_at", { ascending: false }).limit(1).maybeSingle()` pour toujours récupérer la ligne la plus récente en cas de doublon résiduel. Pareil pour le SELECT.

### 3. Corriger `BrandingSectionPage.tsx` — chargement des données

Même fix : ajouter `.order("updated_at", { ascending: false }).limit(1)` avant `.maybeSingle()` pour la table `brand_strategy` (et potentiellement les autres tables sans contrainte unique).

### 4. Corriger les autres points d'insertion

- `src/hooks/use-onboarding.ts` : même pattern de protection
- `src/components/branding/BrandingReview.tsx` : même pattern
- `supabase/functions/diagnostic-enrichment/index.ts` : même pattern

### 5. Corriger `branding-completion.ts`

Ajouter `.order("updated_at", { ascending: false }).limit(1)` à la requête `brand_strategy` dans `fetchBrandingData`.

## Détails techniques

**Migration SQL** :
```sql
-- Deduplicate: keep most recently updated row per (user_id, workspace_id)
DELETE FROM brand_strategy a
USING brand_strategy b
WHERE a.user_id = b.user_id
  AND COALESCE(a.workspace_id, '00000000-0000-0000-0000-000000000000') = COALESCE(b.workspace_id, '00000000-0000-0000-0000-000000000000')
  AND a.id != b.id
  AND (a.updated_at < b.updated_at OR (a.updated_at = b.updated_at AND a.id < b.id));

-- Also merge: for users with both NULL and non-NULL workspace_id rows,
-- keep only the workspace_id row (it's the correct one)
DELETE FROM brand_strategy a
USING brand_strategy b  
WHERE a.user_id = b.user_id
  AND a.workspace_id IS NULL
  AND b.workspace_id IS NOT NULL;

-- Add unique constraint
CREATE UNIQUE INDEX idx_brand_strategy_user_workspace 
ON brand_strategy (user_id, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'));
```

**Pattern de protection côté frontend** (appliqué aux 4 fichiers) :
```typescript
// AVANT
const { data: existing } = await supabase
  .from("brand_strategy").select("id").eq(column, value).maybeSingle();

// APRÈS  
const { data: existing } = await supabase
  .from("brand_strategy").select("id")
  .eq(column, value)
  .order("updated_at", { ascending: false })
  .limit(1)
  .maybeSingle();
```

## Fichiers modifiés

1. **Migration SQL** — déduplication + contrainte unique
2. `src/components/branding/BrandingCoachingFlow.tsx` — saveInsights content_strategy
3. `src/pages/BrandingSectionPage.tsx` — chargement données (ajout `.limit(1)`)
4. `src/lib/branding-completion.ts` — requête fetchBrandingData
5. `src/hooks/use-onboarding.ts` — insertion protégée
6. `src/components/branding/BrandingReview.tsx` — insertion protégée

## Résultat attendu

- Les utilisatrices existantes retrouvent immédiatement leur ligne éditoriale
- Plus aucun doublon ne peut être créé
- Les requêtes `.maybeSingle()` fonctionnent même en cas de données legacy
