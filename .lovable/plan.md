## Audit du bouton "Surfer sur l'actu" et du `NewsjackingPanel`

Tu n'as pas précisé le symptôme, donc voici un audit complet du flux avec les bugs trouvés, classés par probabilité. Je propose des fixes ciblés que tu peux valider un par un.

### Flux global (rappel)

```text
clic "Surfer sur l'actu"
  → setShowNewsjacking(true)  (CreerStepIdea ligne 146)
  → <NewsjackingPanel> monte
  → useEffect → fetchActus() automatique (NewsjackingPanel ligne 163-165)
  → appel edge function newsjacking-ai (jusqu'à 90s, consomme un crédit)
```

### Bugs identifiés (ranking par criticité)

**B1 — Auto-fetch agressif au montage (très probablement ton bug)**
Au clic, le panneau lance instantanément `newsjacking-ai` (90s timeout) **sans confirmation de l'utilisateur**, et **consomme un crédit** dès l'ouverture. Si tu cliques par erreur, tu paies. Si tu retournes en arrière puis re-cliques, double appel.

**B2 — Re-fetch involontaire si `workspaceId` charge en async**
`fetchActus` est memoizé sur `[workspaceId]` (ligne 161) et déclenché par `useEffect([fetchActus])` (ligne 163). Si `workspaceId` arrive d'AuthContext après le premier render (undefined → "abc"), le panneau **relance la recherche** et **double-consomme un crédit**.

**B3 — Pas de garde "loading" dans `fetchAngles**`
Ligne 169 : `if (anglesByIdx[idx]?.data) return;` ne couvre PAS le cas `loading: true`. Si l'utilisatrice clique vite plusieurs fois sur "Voir les angles", on déclenche N appels parallèles à `newsjacking-angles`.

**B4 — `fetchAngles` se recrée sur chaque update de `anglesByIdx**`
Ligne 201 : la dépendance `[anglesByIdx, workspaceId]` fait que `fetchAngles` change de référence à chaque setState. Pas un bug visible mais bruit de re-render dans toutes les cartes.

**B5 — Pas d'AbortController**
Si l'utilisatrice clique "Retour" pendant le fetch (90s), la requête continue, consomme le quota, et déclenche un `setState` après démontage (warning React).

**B6 — `onClose` ne réinitialise rien côté parent**
`onClose` ne fait que `setShowNewsjacking(false)` — le crédit consommé est perdu et l'état interne du panneau est rejeté (nouveau fetch au prochain clic).

### Fixes proposés

1. **B1 — Ajouter un écran d'accueil "Lancer la recherche"**
  Remplacer le `useEffect(() => fetchActus())` par un état initial `idle` qui affiche un CTA explicite ("Trouver des actus pertinentes pour ma marque" + estimation de 30-60s + mention du crédit consommé). Au clic uniquement → `fetchActus`. Élimine B1 et B2 d'un coup.
2. **B3 — Garde anti double-clic dans `fetchAngles**`
  `if (anglesByIdx[idx]?.data || anglesByIdx[idx]?.loading) return;`
3. **B4 — Retirer `anglesByIdx` des deps de `fetchAngles**`
  Utiliser le pattern `setAnglesByIdx((prev) => ...)` partout (déjà fait) et lire l'état via la fonction `setAnglesByIdx` callback ou un ref pour le early-return. Dep finale : `[workspaceId]`.
4. **B5 — AbortController**
  Créer un `controller = new AbortController()` dans `fetchActus`/`fetchAngles`, le passer à `invokeWithTimeout`, et l'abort dans le cleanup du `useEffect` + sur `onClose`.

### Hors scope (déjà OK)

- Authentification & RLS sur `saved_ideas` ligne 232-244 : conforme à la règle workspace_id.
- Bandeau quota (B7 fictif) : déjà géré ligne 99 + 341.

### Question

Tu confirmes que c'est B1/B2 (panneau qui repart / crédit consommé) ou c'est plutôt un autre symptôme (panneau qui ne s'ouvre pas, erreur visible…) ? Si oui, je peux commencer par le fix B1 seul (le plus impactant et le moins risqué). oui cest bien ça

&nbsp;