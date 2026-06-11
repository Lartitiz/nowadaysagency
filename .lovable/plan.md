# Plan — Brancher QuotaWallModal sur le module LinkedIn

## (a) Demande utilisateur — périmètre exact

Brancher `handleQuotaError` (depuis `@/lib/quota-error-handler`) sur tous les call sites `invokeWithTimeout` vers `linkedin-ai` / `linkedin-coaching` du module LinkedIn, pour que les erreurs quota déclenchent QuotaWallModal au lieu d'un toast "Erreur" destructif.

### Pattern unique appliqué partout

Aujourd'hui chaque page fait :

```ts
const res = await invokeWithTimeout("linkedin-ai", { body: {...} }, 60000);
if (res.error) throw new Error(res.error.message);
const content = res.data?.content || "";
```

Après modification :

```ts
const res = await invokeWithTimeout("linkedin-ai", { body: {...} }, 60000);
if (res.error?.isRateLimit || res.data?.error === "limit_reached") {
  if (handleQuotaError({ message: res.error?.message || res.data?.message, data: res.data })) {
    return;
  }
}
if (res.error) throw new Error(res.error.message);
const content = res.data?.content || "";
```

Le `return` à l'intérieur du `try` saute proprement au `finally` qui reset le `setLoading(false)`. Le `catch` n'est pas traversé donc aucun toast "Erreur" parasite. Les erreurs non-quota tombent dans `throw` → `catch` existant inchangé.

### Fichiers et points d'insertion

1. **src/pages/LinkedInPostGenerator.tsx** — 1 call site (ligne ~56). Ajouter import `handleQuotaError`.
2. **src/pages/LinkedInProfil.tsx** — 1 call site (ligne ~99). Ajouter import.
3. **src/pages/LinkedInResume.tsx** — 2 call sites (lignes ~146 et ~181). Ajouter import.
4. **src/pages/LinkedInParcours.tsx** — 2 call sites (lignes ~82 et ~119). Ajouter import.
5. **src/pages/LinkedInRecommandations.tsx** — 2 call sites (lignes ~113 et ~129). Ajouter import.
6. **src/pages/LinkedInCrosspost.tsx** — 1 call site (ligne ~102). Ajouter import. (NB : ce fichier semble être un ancien doublon de `CrosspostFlow.tsx` qui, lui, gère déjà le quota. Je l'aligne quand même car il est listé dans le périmètre.)
7. **src/components/linkedin/LinkedInCoaching.tsx** — 2 call sites (lignes ~93 et ~123). Pattern adapté : la destructuration utilise déjà `{ data, error }`, et le test actuel est `if (data?.error) throw new Error(data.error)`. Je remplace par le pattern unifié ci-dessus en utilisant `data` / `error` au lieu de `res.data` / `res.error`. Ajouter import.
8. **src/components/CrosspostFlow.tsx** — déjà branché (lignes 125-129). **Amélioration mineure** : aligner sur le pattern unifié (cf. section (b)) ou laisser tel quel. Voir (b).

### Critères de validation

- `npx tsc --noEmit --skipLibCheck` passe sans erreur.
- Les imports sont ajoutés une seule fois par fichier, regroupés avec les autres imports `@/lib/...`.
- Aucune modification dans : `LinkedInAudit.tsx`, `quota-error-handler.ts`, `invoke-with-timeout.ts`, edge functions, payloads, parsing, setState métier, messages des toasts non-quota.

---

## (b) Propositions d'amélioration (à valider/refuser séparément)

### B1. Aligner `CrosspostFlow.tsx` sur le pattern unifié

Actuellement la condition `if (cpError?.isRateLimit || cpData?.error === "limit_reached")` est correcte mais elle a un défaut subtil : si `handleQuotaError` retourne `false` (cas improbable mais possible si la détection échoue), on tombe ensuite dans `if (cpError) throw` → toast destructif. C'est cohérent avec le reste, mais on peut le simplifier en supprimant le pré-filtre `isRateLimit/limit_reached` et en appelant directement `handleQuotaError` sur toute erreur. **Risque** : trivial. **Bénéfice** : un seul pattern dans toute la base. ok

### B2. Factoriser le pattern dans un helper

Créer `src/lib/handle-ai-response.ts` exportant par ex. `checkQuotaOrThrow(res): boolean` qui encapsule les 4 lignes répétées 11 fois. **Risque** : élargit le périmètre, touche aux 8 fichiers avec une nouvelle abstraction. **Bénéfice** : DRY, futurs call sites protégés par défaut. À faire dans un plan séparé si validé. non

### B3. Uniformiser `useToast` vs `sonner` dans le module LinkedIn

`LinkedInPostGenerator/Profil/Resume/Parcours/Recommandations` utilisent `useToast` (shadcn), `LinkedInCrosspost/Coaching/CrosspostFlow` utilisent `sonner`. Hors périmètre quota, mais source de friction visuelle. À traiter dans un plan dédié si pertinent. non

---

## Hors scope confirmé

- `LinkedInAudit.tsx` (gestion quota dédiée)
- Backend / edge functions
- Refonte `QuotaExhaustedCard`
- Harmonisation `workspace_id`