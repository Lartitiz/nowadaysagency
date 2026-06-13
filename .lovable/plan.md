# Plan — Scoper les clés de persistance par utilisateur

## (a) Demandé

### 1. `src/components/ProtectedRoute.tsx`

- Remplacer la clé `onboarding_checked` par une clé scopée `onboarding_checked:{user.id}`.
- Init des `useState` :
  - `checkingOnboarding` : init à `true` par défaut (on ne lit plus le storage à l'init, car `user.id` n'est pas garanti dispo synchroniquement). Cohérent avec « si user pas résolu → checking = true ».
  - `needsOnboarding` : init à `false`.
- Dans le `useEffect` (déjà déclenché par `user?.id`) :
  - Si `user?.id`, lire d'abord `sessionStorage.getItem(\`onboarding_checked:${user.id})` :
    - `"done"` → `setNeedsOnboarding(false)` ; `setCheckingOnboarding(false)` ; pas de fetch DB.
    - `"needs"` → `setNeedsOnboarding(true)` ; `setCheckingOnboarding(false)` ; pas de fetch.
    - sinon → fetch DB existant, puis `sessionStorage.setItem(\`onboarding_checked:${user.id}, done ? "done" : "needs")`.
  - Branche démo : écrire `onboarding_checked:demo` (au lieu de la clé globale) pour préserver le shortcut sans pollution cross-compte.
- Ne pas toucher la logique démo / `DEMO_READY_ROUTES` / feature flags / redirections.
- Mettre à jour `src/lib/storage-cleanup.ts` (cf. §3) pour balayer le nouveau pattern.

### 2. `src/hooks/use-flow-persistence.ts`

- Backup localStorage : clé devient `creer_flow_state_backup:{userId}`.
- Mécanisme userId : voir §(b) ci-dessous — proposition « registre module » (`setFlowUserId` / `getFlowUserId`). À valider avant exec.
- `saveFlowState` :
  - Si `userId` connu et `step !== "idea"` → écrire dans `creer_flow_state_backup:{userId}`.
  - Si `userId` inconnu → ne PAS écrire de backup (la sessionStorage reste, ça suffit pour le tab actif).
  - **Nouveau** : si `state.step === "idea"` (étape de départ) → supprimer le backup `creer_flow_state_backup:{userId}` (corrige le résidu actuel).
- `loadFlowState` :
  - sessionStorage `creer_flow_state` : inchangé (cf. §3 ci-dessous).
  - Fallback backup : lire `creer_flow_state_backup:{userId}` uniquement si `userId` est connu. Si inconnu → renvoyer `null` sur le fallback (pas de réhydratation aveugle).
- `clearFlowState` :
  - sessionStorage `creer_flow_state` : `removeItem` inchangé.
  - localStorage : `removeItem(\`creer_flow_state_backup:${userId})`si`userId`connu ; sinon balayer toutes les clés`localStorage`préfixées par`creer_flow_state_backup`(filet de sécurité côté hook, indépendant de`storage-cleanup`).
- TTL 2h (`MAX_AGE_MS`) : inchangé.

### 3. `src/lib/storage-cleanup.ts`

- Retirer `"creer_flow_state_backup"` de `LOCAL_KEYS` (clé non scopée → n'existe plus).
- Ajouter un balayage : `Object.keys(localStorage).filter(k => k.startsWith("creer_flow_state_backup")).forEach(localStorage.removeItem)`.
- Idem côté session pour `onboarding_checked` : retirer la clé fixe et balayer les clés `onboarding_checked` + `onboarding_checked:*`.

### Confirmation sur `creer_flow_state` (sessionStorage, non backup)

**Pas de risque résiduel identifié, donc on ne scope pas** :

- sessionStorage est isolée par onglet.
- La clé est purgée :
  - au logout via `clearAppStorage()` (avant `supabase.auth.signOut`),
  - au switch de compte via `clearFlowState()` dans `use-account-switcher` (ligne 71),
  - au retour à l'étape "idea" via le `useEffect` de reset (`CreerUnifie.tsx` L209).
- Si on scope aussi backup → aucun chemin par lequel un état du compte précédent puisse être réhydraté chez le compte suivant.

## (b) Proposition d'implémentation — userId dans `use-flow-persistence`

Trois options envisagées, **je recommande l'option C**, à valider :

- **Option A — Passer `userId` en argument** à `saveFlowState/loadFlowState/clearFlowState`.
  - Robuste, explicite. Inconvénient : touche `CreerUnifie.tsx` (≈6 call sites), `Dashboard.tsx`, `AdaptiveHome.tsx`, `use-account-switcher.ts`. Beaucoup de surface modifiée.
- **Option B — Parsing synchrone du token Supabase** dans `localStorage` (`sb-<ref>-auth-token` → `user.id`).
  - Aucune dépendance applicative à câbler. Inconvénient : fragile (format interne Supabase, peut changer), et lit le token à chaque call.
- **Option C (recommandée) — Registre module simple** : ok
  - Ajouter dans `use-flow-persistence.ts` :
    ```ts
    let currentFlowUserId: string | null = null;
    export function setFlowUserId(id: string | null) { currentFlowUserId = id; }
    function getFlowUserId(): string | null { return currentFlowUserId; }
    ```
  - Câbler une seule fois dans `AuthContext.tsx` : dans le `useEffect` qui écoute `onAuthStateChange` + `getSession`, appeler `setFlowUserId(session?.user?.id ?? null)`.
  - Avantages : 1 seul point de câblage, synchrone, pas de parsing fragile, callers inchangés. Inconvénient : couplage léger Auth → persistance (acceptable, c'est exactement le besoin).
  - Garde-fou : si `getFlowUserId() === null` au moment d'un save/load, on dégrade proprement (pas de backup, pas de fallback localStorage) plutôt que d'écrire une clé non scopée.

## Validation

- `npx tsc --noEmit --skipLibCheck` → 0 erreur.
- Compte A onboardé → logout → compte B neuf se connecte → `/onboarding` (pas de flash "done").
- Refresh sur même compte au milieu du flow → état restauré.
- Switch via `use-account-switcher` → aucune réhydratation cross-compte (sessionStorage purgée + backup scopé).
- Retour à l'étape "idea" → la clé `creer_flow_state_backup:{userId}` est bien supprimée (DevTools → Application → localStorage).

## Décisions à valider avant exec

1. **Option C** pour le userId dans `use-flow-persistence` (vs A ou B) ?
2. Pour la démo, scoper `onboarding_checked:demo` (et non plus la clé globale) — OK ?
3. Balayage `startsWith("creer_flow_state_backup")` dans `clearAppStorage` plutôt que liste exhaustive — OK ?