## Objectif

Créer un helper unique et pur `src/lib/onboarding-status.ts` qui résout le statut onboarding en 3 états explicites (`done` | `needs` | `unknown`), sans jamais interpréter un résultat non fiable comme « pas onboardé ».

## Analyse des logiques divergentes existantes


| Fichier                       | Logique    | Erreur/null → …                      |
| ----------------------------- | ---------- | ------------------------------------ |
| `ProtectedRoute.tsx`          | OR (`||`)  | `needs` (cause du bug boucle)        |
| `AuthContext.tsx`             | AND (`&&`) | `/onboarding`                        |
| `use-onboarding.ts`           | OR (`||`)  | `done = false` (continue onboarding) |
| `use-guide-recommendation.ts` | OR (`||`)  | `false`                              |


Le helper unifie sur **OR** (une seule table à `true` suffit — empêche le lockout si une table n'a pas été mise à jour).

## Fichier créé

- `src/lib/onboarding-status.ts` (nouveau, seul fichier modifié)

## Comportement du helper

```text
Type: OnboardingStatus = "done" | "needs" | "unknown"

resolveOnboardingStatus({ profileUserId, planConfigUserId }): Promise<OnboardingStatus>

Règles de décision :
- "done"    → au moins une des deux tables renvoie onboarding_completed === true
- "needs"   → au moins une ligne existe avec onboarding_completed === false
              ET aucune des deux tables ne renvoie true
- "unknown" → les deux requêtes renvoient null/undefined (ex: RLS sans token)
              OU une erreur est levée
```

Contraintes respectées :

- `profileUserId` et `planConfigUserId` restent **séparés** (les appelants existants utilisent des IDs différents via workspace).
- `.maybeSingle()` sur les deux requêtes (pas d'erreur si 0 ligne).
- Pas de gating session/token dans le helper : c'est la responsabilité de l'appelant.
- Pas d'import/usage dans d'autres fichiers à ce stade.

## Réponse à la question sur l'accessToken optionnel

**(a) Ce que tu demandes** : le helper ne gère pas le gating token — l'appelant s'en charge.

**(b) Proposition** : je maintiens cette séparation de responsabilités. Ajouter un `accessToken` optionnel ferait du helper un garde-token, ce qui va à l'encontre de l'objectif (le garder pur et testable). L'appelant vérifie déjà `session?.access_token` via `useAuth()` avant d'appeler.

## Validation

- `npx tsc --noEmit --skipLibCheck` → 0 erreur.
- Le fichier exporte bien le type `OnboardingStatus` et la fonction `resolveOnboardingStatus`.

## Hors scope (prompts suivants)

- Brancher les 4 appelants existants.
- Centraliser un hook `useAuthReady` réutilisable.
- Audit des autres lectures/écritures `onboarding_completed` ou `sessionStorage`. Voici le message à lui coller :
  ---
  Plan validé, tu peux passer en Exec. Deux précisions à respecter dans l'implémentation :
  **1. Distinction null vs false (critique).** Pour le cas `"needs"`, teste bien la présence de la ligne AVANT la valeur :
  ts
  ```ts
  const profileFalse = profile !== null && profile.onboarding_completed === false;
  const configFalse  = config  !== null && config.onboarding_completed  === false;
  ```
  Ne teste pas `profile?.onboarding_completed === false` directement — sur une ligne absente ça doit rester `"unknown"`, jamais `"needs"`. Un `null` (ligne absente ou bloquée RLS) ne doit JAMAIS contribuer à `"needs"`.
  **2. Utilise** `Promise.allSettled` **plutôt que** `Promise.all`**.** Si une seule des deux requêtes échoue, je veux quand même exploiter la table qui a répondu. On ne tombe en `"unknown"` que si les DEUX sont indisponibles (null ou rejetées). Ça évite de jeter une info fiable à cause de l'autre table.
  Le reste du plan est bon tel quel : OR comme défaut, ids séparés, `.maybeSingle()`, pas de gating token dans le helper.
  Une chose : ne crée pas de hook `useAuthReady` — on s'appuie sur `useAuth().session` côté appelants, c'est juste une mention hors-scope, rien à implémenter.