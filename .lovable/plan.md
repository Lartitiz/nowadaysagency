## Objectif

Empêcher `useFormPersist` de décider du `step` au remount. La restauration du step est déjà correctement gérée par `safeStep` (via `use-flow-persistence`) qui possède le `result`.

## Cause racine

`useFormPersist` persiste le step mais PAS le `result`. Au remount, son callback voit `saved.step === "result"`, ne trouve pas `result` dans son store, et fait retomber à "format" via le bloc fragile. `safeStep`, exécuté auparavant, avait pourtant correctement restauré "result" depuis le flow-persistence qui, lui, possède le `result`.

## Fichier et modification

- `src/pages/CreerUnifie.tsx` — lignes 199-215 (callback `useFormPersist`)

### Changement : retirer le bloc `setStep` du callback

**Avant (lignes 199-215) :**

```tsx
(saved) => {
  if (!shouldRestore) return; // Fresh navigation — don't restore
  if (searchParams.get("format") || searchParams.get("sujet")) return;
  if (saved.step && saved.step !== "idea") {
    const fragile = ["questions", "structure_review", "inspiration_proposals", "result", "edit"];
    const safe = fragile.includes(saved.step as string)
      ? (saved.selectedFormat ? "format" : "idea")
      : saved.step;
    // Ne pas écraser un step déjà "result"/"edit" valablement restauré par safeStep
    setStep((prev) => (prev === "result" || prev === "edit" ? prev : (safe as Step)));
  }
  if (saved.ideaText) setIdeaText(saved.ideaText);
  if (saved.objective) setObjective(saved.objective);
  if (saved.selectedFormat) setSelectedFormat(saved.selectedFormat);
  if (saved.editorialAngle) setEditorialAngle(saved.editorialAngle);
  if (saved.answers && Object.keys(saved.answers).length) setAnswers(saved.answers);
}
```

**Après :**

```tsx
(saved) => {
  if (!shouldRestore) return; // Fresh navigation — don't restore
  if (searchParams.get("format") || searchParams.get("sujet")) return;
  if (saved.ideaText) setIdeaText(saved.ideaText);
  if (saved.objective) setObjective(saved.objective);
  if (saved.selectedFormat) setSelectedFormat(saved.selectedFormat);
  if (saved.editorialAngle) setEditorialAngle(saved.editorialAngle);
  if (saved.answers && Object.keys(saved.answers).length) setAnswers(saved.answers);
}
```

## Ce qui reste inchangé (confirmé)

- `safeStep` (lignes 135-144) : source de vérité du step au mount. Intact.
- `use-flow-persistence.ts` : intact.
- Le `useEffect` de sauvegarde `saveFlowState` (lignes ~368-389) : intact.
- Le `useEffect` de "fresh start" (lignes 220-235) : intact, y compris son `setStep("idea")` légitime.
- Tous les autres `setStep(...)` du fichier : intacts.
- `useFormPersist` (hook) : intact.
- Imports : inchangés (`useFormPersist` reste importé et utilisé).
- `draftRestored` (ligne 196) : inchangée (toujours destructurée, non lue ailleurs).
- `clearDraft` (lignes 223, 1520) : inchangé.

## Propositions d'amélioration (séparées) ok

### b1. Redondance de `useFormPersist`

`useFormPersist` persiste `{ step, ideaText, objective, selectedFormat, editorialAngle, answers }` — un sous-ensemble strict de ce que `use-flow-persistence` persiste déjà (`persistedState.current` contient tous ces champs + `result`, `editContent`, etc.). En pratique, `useFormPersist` est entièrement redondant. Consolidation possible : supprimer `useFormPersist` et ne garder que `use-flow-persistence`. À valider séparément.

### b2. Signature simplifiée

Si on garde `useFormPersist` malgré la redondance, on pourrait ne plus lui passer `step` dans `values` (puisque c'est un champ qu'on ne restaure plus). Le hook persisterait moins. Intérêt marginal.

## Validation

1. `npx tsc --noEmit --skipLibCheck` : 0 erreur.
2. Générer un carrousel → cliquer "générer les slides visuelles" → le flow RESTE sur "result".
3. Recharger (F5) sur l'étape "result" → on revient sur "result" (via `safeStep`).
4. Clic frais "Créer" depuis la sidebar (sans contexte) → démarre sur "idea", state vierge.