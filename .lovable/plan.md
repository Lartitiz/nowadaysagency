## Bug

Quand on déplie une actu non pré-calculée, `fetchPrimaryAngle` (et `fetchVariants`) déclenchent un spinner infini. La déduplication s'appuie sur une variable locale `shouldFetch` mutée DANS l'updater de `setAnglesByIdx`, puis lue immédiatement après :

```ts
let shouldFetch = false;
setAnglesByIdx((prev) => {
  if (prev[idx]?.data || prev[idx]?.loading) return prev;
  shouldFetch = true;
  return { ...prev, [idx]: { loading: true, ... } };
});
if (!shouldFetch) return; // ← lu avant que l'updater ne tourne
```

En React 18, les updaters fonctionnels passés à `setState` sont exécutés au prochain flush, pas synchrone. Quand le composant a déjà une update en attente (typiquement après le `setExpandedActu` du onClick), l'updater est différé → `shouldFetch` reste `false`, le `if (!shouldFetch) return` court-circuite la requête, MAIS le `setAnglesByIdx` finit par poser `loading: true` quand le flush arrive. Résultat : spinner perpétuel, aucun appel réseau, aucune erreur.

## Fix (1 fichier : `src/components/creer/NewsjackingPanel.tsx`)

Remplacer la déduplication par des refs Set lues/écrites synchrones AVANT tout setState. L'updater devient pur (ne mute plus rien à l'extérieur).

### 1. Ajouter deux refs à côté de `anglesByIdx`

```ts
const primaryStartedRef = useRef<Set<number>>(new Set());
const variantsStartedRef = useRef<Set<number>>(new Set());
```

### 2. Refondre `fetchPrimaryAngle`

Garde synchrone avant tout :

```ts
const fetchPrimaryAngle = useCallback(async (idx: number, actu: Actu) => {
  if (primaryStartedRef.current.has(idx)) return;
  primaryStartedRef.current.add(idx);
  setAnglesByIdx((prev) => {
    if (prev[idx]?.data || prev[idx]?.loading) return prev; // safety net
    return { ...prev, [idx]: { loading: true, startedAt: Date.now(), slow: false, primaryOnly: true } };
  });
  // ... reste identique
}, [workspaceId]);
```

Dans `finish` (en cas d'erreur uniquement), retirer `idx` du Set pour que "Réessayer" puisse relancer :

```ts
const finish = (next: Partial<AnglesState>) => {
  clearTimeout(slowTimer);
  if (next.error) primaryStartedRef.current.delete(idx);
  console.log(...);
  setAnglesByIdx((prev) => ({ ...prev, [idx]: { ...prev[idx], loading: false, ...next } }));
};
```

(catch final → idem : `primaryStartedRef.current.delete(idx)` avant `finish({error...})` — déjà couvert par la branche `if (next.error)`).

### 3. Refondre `fetchVariants`

Même schéma, et passer `primaryVehicule` en 3ᵉ paramètre depuis les boutons "Voir 2 autres angles" (lignes 866 et 896) au lieu de le lire dans l'updater :

```ts
const fetchVariants = useCallback(async (idx: number, actu: Actu, primaryVehicule?: string) => {
  if (variantsStartedRef.current.has(idx)) return;
  variantsStartedRef.current.add(idx);
  setAnglesByIdx((prev) => {
    const s = prev[idx];
    if (!s?.data || !s.primaryOnly || s.variantsLoading) return prev;
    return { ...prev, [idx]: { ...s, variantsLoading: true, variantsSlow: false, variantsError: undefined } };
  });
  // ... appel newsjacking-angles avec exclude_vehicules: primaryVehicule ? [primaryVehicule] : []
}, [workspaceId]);
```

Dans `finishVariants`, si `next.error` → `variantsStartedRef.current.delete(idx)`.

Aux deux call sites :

```ts
fetchVariants(idx, actu, anglesState.data?.[0]?.vehicule);
```

### 4. Réinitialiser les refs dans `fetchActus`

À côté du `setAnglesByIdx({})` (ligne 167) :

```ts
setAnglesByIdx({});
primaryStartedRef.current = new Set();
variantsStartedRef.current = new Set();
```

### 5. Bouton "Réessayer"

Le code actuel supprime déjà l'entrée d'`anglesByIdx` puis appelle `fetchAngles(idx, actu)`. Comme `finish` retire `idx` de la ref en cas d'erreur, ça fonctionne tel quel. À côté du `setAnglesByIdx((prev) => { delete next[idx]; return next; })`, ajouter par sécurité `primaryStartedRef.current.delete(idx);` (cas où l'utilisatrice clique Réessayer avant que l'erreur ne se commit).

## Ce qui ne bouge pas

- `PRECOMPUTE_COUNT`, délais de pré-calcul, `invokeWithTimeout`, `mapFnError`
- JSX, états `slow` / `variantsSlow`, `handleSelectAngle`, `handleSaveActu`, `handleHide`
- Edge functions, aucun autre fichier
- La signature publique du composant

## Validation

- `tsc --noEmit` clean
- Déplier la 5ᵉ actu (hors pré-calcul) → log `[newsjacking-angles] primary start` puis `primary done` → angles affichés
- Forcer une erreur (offline) → "Réessayer" relance bien un appel
- "Voir 2 autres angles" → 2 angles complémentaires avec un véhicule différent du primary
