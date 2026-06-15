## Objectif

Faire de `ProtectedRoute.tsx` un consommateur fiable de `resolveOnboardingStatus`, avec gating session/token, garde anti-boucle, et un cache qui n'écrit JAMAIS un état non fiable.

## Fichier modifié

- `src/components/ProtectedRoute.tsx` (seul fichier touché)

## Plan d'implémentation

### 1. Imports & hooks

- Importer `resolveOnboardingStatus, type OnboardingStatus` depuis `@/lib/onboarding-status`.
- Récupérer `session` depuis `useAuth()` : `const { user, session, loading, isAdmin } = useAuth()`.
- Ajouter une ref pour compter les tentatives de gating : `const attemptsRef = useRef(0)`.
- Ajouter une ref pour mémoriser si le check a déjà tourné token-en-main pendant ce mount : `const ranWithTokenRef = useRef(false)`.

### 2. Lecture du cache (révisée)

- Cas démo / `!user` / `/onboarding` → inchangé.
- `cached === "done"` → définitif, on rend immédiatement.
- `cached === "needs"` → **NE PLUS obéir aveuglément**. Si `session?.access_token` est présent et `ranWithTokenRef.current === false`, on ignore le cache et on lance un nouveau check. Sinon (pas de token encore), on l'utilise comme avant.

### 3. Gating session/token

- Si `loading === true` OU `!session?.access_token` :
  - Incrémenter `attemptsRef.current`.
  - **Garde anti-boucle** : si `attemptsRef.current >= 3` ou si un timer cumulatif dépasse ~5s, on sort du loading en laissant passer (`setNeedsOnboarding(false)`, `setCheckingOnboarding(false)`), SANS écrire le cache. Console.warn pour traçabilité.
  - Sinon : rester en `checkingOnboarding = true`, l'effet se redéclenchera quand `session` arrive (dep array inclut `session?.access_token`).
- Si token présent : on passe à l'étape 4.

### 4. Appel du helper + décision

Remplacer le bloc `Promise.all([...])` par :

```ts
const status = await resolveOnboardingStatus({
  profileUserId: user.id,
  planConfigUserId: user.id,
});
ranWithTokenRef.current = true;

switch (status) {
  case "done":
    setNeedsOnboarding(false);
    sessionStorage.setItem(scopedKey, "done");
    break;
  case "needs":
    setNeedsOnboarding(true);
    sessionStorage.setItem(scopedKey, "needs");
    break;
  case "unknown":
    // Ne RIEN cacher, ne PAS rediriger. Retentera au prochain rendu utile.
    setNeedsOnboarding(false);
    break;
}
setCheckingOnboarding(false);
```

### 5. Catch nettoyé

```ts
catch (e) {
  console.error("Onboarding check failed:", e);
  // Traité comme "unknown" : pas de cache, pas de redirection.
  setNeedsOnboarding(false);
  setCheckingOnboarding(false);
}
```

Ne JAMAIS `setNeedsOnboarding(true)` dans le catch.

### 6. Dépendances de l'effet

`[user?.id, isDemoMode, location.pathname, session?.access_token]` — l'ajout d'`access_token` permet de redéclencher le check dès que le JWT arrive.

## Ce qui reste strictement inchangé

- Toute la branche `isDemoMode` (DEMO_READY_ROUTES, cache `onboarding_checked:demo`, JSX du panneau).
- Spinner de chargement (3 dots).
- `if (!user) return <Navigate to="/login" replace />`.
- Check `isRouteVisible` + redirection `/dashboard`.
- Redirection finale `if (needsOnboarding && location.pathname !== "/onboarding")`.
- Skip sur `location.pathname === "/onboarding"`.
- Scoping de la clé `onboarding_checked:${user.id}`.

## Validation

- `npx tsc --noEmit --skipLibCheck` → 0 erreur.
- Login compte onboardé → `/dashboard` direct, pas de rebond.
- Refresh dur sur `/dashboard` → reste.
- Compte `onboarding_completed = false` deux tables → toujours redirigé `/onboarding`.
- Réseau coupé bref → pas de redirection erronée, retente quand token revient.

## Réponse à la proposition d'amélioration

**(a) Ce que tu demandes** : tout ce qui précède.

**(b) Ma proposition** : introduire un type explicite `type CheckState = "idle" | "checking" | "done" | "needs"` pour remplacer le couple `(checkingOnboarding, needsOnboarding)`. C'est plus lisible et évite les états incohérents (ex: `checking=false && needs=false` ambigu entre "done" et "unknown laissé passer").

→ **Recommandation : NE PAS l'inclure dans ce prompt.** Ça élargit la surface modifiée, complique la review, et le couple actuel reste lisible avec les commentaires. À garder pour un prompt de refacto dédié si le besoin se confirme après les prompts 3-5.

Je m'en tiens donc strictement à (a).

## Hors scope

- `AuthContext`, `use-onboarding`, `use-guide-recommendation` (prompts 3, 4, 5).
- Refonte du flow onboarding.
- Hook `useAuthReady` partagé. Plan validé sur le fond, et d'accord pour repousser ta proposition (b) à un prompt dédié. Deux corrections à appliquer avant d'implémenter :
  **1. Reset du compteur de tentatives.** `attemptsRef` ne doit compter que les tentatives **consécutives sans token**, pas le cumul de la session. Remets `attemptsRef.current = 0` dès qu'un check tourne avec token présent. Et borne plutôt par **temps écoulé** (ex. un timestamp de premier essai, abandon si >5s) que par nombre de renders — 3 re-renders peuvent passer en quelques ms au montage et déclencher la garde à tort.
  **2. Flag terminal sur la garde.** Quand la garde anti-boucle abandonne (laisse passer), pose un `gaveUpRef.current = true` qui empêche le gating de se ré-armer au render suivant. Sinon le couple `setState` + dep `session?.access_token` peut créer un re-déclenchement en boucle. Une fois abandonné pour ce mount, on ne re-tente plus tant que `user.id` ne change pas.
  Le reste (switch sur le helper, catch → `unknown` sans cache, invalidation du cache `needs` token-en-main, dep array) est bon tel quel.