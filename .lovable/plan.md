

## Fix workspace isolation — "Salut Laetitia" sur le dashboard de Marion + données vides

### Diagnostic confirmé (base + code)

**Vérifié en base** : les données de Marion sont bien présentes et correctement taguées avec `workspace_id` pour ses 2 workspaces :

| Table | Rows avec `workspace_id` de Marion | Rows orphelines (`user_id` seul) |
|---|---|---|
| storytelling | 1 | 0 |
| persona | 1 | 0 |
| brand_proposition | 1 | 0 |
| brand_profile | 1 | 0 |
| brand_strategy | 1 | 0 |
| brand_charter | 1 | 0 |
| offers | 0 | 0 |

Bonne nouvelle : **brand_charter a bien une colonne `workspace_id`** (le memo était obsolète). **Aucune migration DB nécessaire.**

**Confirmé côté code** : tu es bien `manager` sur le workspace `b361a5f2…` de Marion (user_id `7860d5e5…`, email `contact@lejardinparfume.fr`). Le bug est **100 % frontend** — une seule fonction oublie d'utiliser `useProfileUserId()`.

### La cause unique

`src/hooks/use-guide-recommendation.ts` — lignes 237-244 :

```ts
(supabase.from("profiles") as any)
  .select("prenom, onboarding_completed")
  .eq("user_id", user.id)           // ← TOI (Laetitia), pas Marion
  .maybeSingle(),
(supabase.from("user_plan_config") as any)
  .select("onboarding_completed")
  .eq("user_id", user.id)           // ← TOI à nouveau
  .maybeSingle(),
```

Résultat sur le dashboard de Marion :
- `firstName = "Laetitia"` → "Salut Laetitia 👋" s'affiche
- `onboardingDone` calculé sur TON onboarding à toi, pas celui de Marion → mauvaise reco guide

Toutes les autres requêtes du même hook (`calendar_posts`, `instagram_audit`, `content_drafts`, `fetchBrandingData`) utilisent correctement `filter.column / filter.value` venant de `useWorkspaceFilter`. Donc le Branding qui paraît vide n'est PAS vide à cause du filtre — il est rempli en base mais la page d'affichage doit être vérifiée séparément (voir point 2 ci-dessous).

### Ce qu'on corrige

#### 1. Fix principal — `use-guide-recommendation.ts`

Remplacer `user.id` par `useProfileUserId()` pour les 2 requêtes `profiles` + `user_plan_config` :

```ts
import { useWorkspaceFilter, useProfileUserId } from "@/hooks/use-workspace-query";
// ...
const profileUserId = useProfileUserId();  // owner du workspace actif (Marion) ou user.id si pas de workspace

// dans la Promise.all :
(supabase.from("profiles") as any)
  .select("prenom, onboarding_completed")
  .eq("user_id", profileUserId)
  .maybeSingle(),
(supabase.from("user_plan_config") as any)
  .select("onboarding_completed")
  .eq("user_id", profileUserId)
  .maybeSingle(),
```

Ajouter `profileUserId` dans la `queryKey` pour que le cache se réinitialise au switch de workspace :
```ts
queryKey: ["guide-recommendation", user?.id, profileUserId, column, value, isDemoMode],
```

Impact : dès que tu passes sur le workspace de Marion, "Salut Marion 👋" s'affiche et la reco guide se base sur son état réel (pas le tien).

#### 2. Vérification des pages de Branding

Les **données** sont en base (vérifié). Si les pages Branding s'affichent vides sur le workspace de Marion, c'est que certaines sous-pages utilisent encore `user.id` ou `useProfileUserId()` au lieu de `useWorkspaceFilter()`. Je veux faire un **scan ciblé** dans les 6 sous-pages Branding (`BrandingAuditPage`, `BrandingCoachingFlow`, `BrandingSuggestionsCard`, pages section story/persona/proposition/tone/strategy/offers/charter) et corriger les requêtes qui filtrent mal.

Pattern de fix attendu (à appliquer uniquement où c'est nécessaire) :
- Tables avec colonne `workspace_id` (storytelling, persona, brand_proposition, brand_profile, brand_strategy, brand_charter, offers) → `useWorkspaceFilter()`
- Tables sans colonne `workspace_id` (profiles, user_plan_config, voice_profile) → `useProfileUserId()` / `useProfileFilter()`

Je scannerai les 6 sections Branding et ne modifierai que les fichiers qui filtrent mal. Liste qui sera affichée avant modif.

#### 3. Bonus — `BrandingAuditPage.tsx` ligne 114

```ts
.eq("id", user.id)  // ← bug : "id" n'est pas la bonne colonne pour profiles (c'est "user_id")
```
→ Probablement cassé depuis longtemps, je corrige en passant (`.eq("user_id", profileUserId)`).

### Hors scope

- Pas de migration DB (colonnes en place, données présentes et taguées)
- Pas de backfill (aucune row orpheline)
- Pas de refonte de `useWorkspaceFilter` / `useProfileUserId` — le pattern est bon
- Pas de fix des leaks Edge Functions déjà listés dans ton memo (Pinterest, calendar-coaching) — à traiter séparément

### Fichiers modifiés

| Fichier | Changement |
|---|---|
| `src/hooks/use-guide-recommendation.ts` | `user.id` → `profileUserId` sur les 2 requêtes `profiles` + `user_plan_config`, ajout dans queryKey |
| `src/pages/BrandingAuditPage.tsx` | `.eq("id", user.id)` → `.eq("user_id", profileUserId)` |
| **Scan Branding sections** (fichiers à confirmer après scan) | Fix des filtres `user.id`/`profileUserId` qui devraient être `useWorkspaceFilter` — liste affichée avant modifs |

### Validation

1. Sur le dashboard de Marion (workspace `b361a5f2…`) → "Salut **Marion** 👋" (et non Laetitia)
2. Sur `/branding` sur le workspace de Marion → voir ses 6 sections remplies (storytelling + persona + proposition + tone + strategy + charter, et offers vide c'est normal)
3. Switch retour sur ton workspace Laetitia → "Salut **Laetitia** 👋" + tes propres données
4. Vérifier que le switch de workspace invalide bien le cache React Query (pas de flash de l'ancien workspace)

### Risque

Faible. Le pattern `useProfileUserId()` existe et est déjà utilisé correctement dans 17 fichiers. On ne fait qu'aligner `use-guide-recommendation.ts` sur le même pattern. Les tables concernées ont les bonnes colonnes en base (vérifié). Si un fix Branding section révèle un cas tordu, je le signale avant d'appliquer.

