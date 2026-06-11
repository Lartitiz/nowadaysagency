## Bug

Sur l'étape 3 (Affine le brief = `step === "questions"`), si l'utilisatrice quitte la page puis revient :

- `step` est restauré depuis `sessionStorage` → `"questions"`.
- MAIS `questions[]` (le tableau de questions IA) vit dans le hook `useContentGenerator`, qui se ré-instancie vide. Idem pour `structureProposal`, `inspirationProposals[]`, `loadingQuestions`.
- Résultat : `CreerStepQuestions` reçoit `questions=[]` et `loadingQuestions=false` → tombe sur la branche "Pas de questions pour ce format" avec un bouton "Générer directement" qui lance une génération sans contexte (d'où le "ça fait sauter") + bouton retour qui paraît cassé parce que l'écran lui-même est déjà dégradé.

Le garde-fou actuel `src/pages/CreerUnifie.tsx:129` tombe sur `"idea"` pour `structure_review` et `inspiration_proposals`, mais **oublie `"questions"`**. Et il renvoie vers `"idea"` alors que `selectedFormat` est restauré — on perd le contexte alors qu'on aurait pu reprendre proprement à l'étape Format.

## Fix (1 fichier : `src/pages/CreerUnifie.tsx`)

### 1. Élargir `safeStep` (ligne 125-131)

Ajouter `"questions"` à la liste des steps "fragiles" et faire retomber vers `"format"` si un `selectedFormat` est disponible, sinon `"idea"`.

```ts
const safeStep = (() => {
  if (!ps?.step) return "idea";
  if (ps.step === "result" && ps.result) return "result";
  if (ps.step === "edit" && ps.editContent) return "edit";
  // États avec données volatiles non persistées (questions, structure, propositions)
  if (["questions", "structure_review", "inspiration_proposals", "result", "edit"].includes(ps.step)) {
    return ps.selectedFormat ? "format" : "idea";
  }
  return ps.step as Step;
})();
```

### 2. Même garde-fou dans le callback `useFormPersist` (ligne 184-193)

Le callback `restoreFn` peut aussi appeler `setStep(saved.step)` directement, court-circuitant `safeStep`. Appliquer la même règle :

```ts
(saved) => {
  if (!shouldRestore) return;
  if (searchParams.get("format") || searchParams.get("sujet")) return;
  if (saved.step && saved.step !== "idea") {
    const fragile = ["questions", "structure_review", "inspiration_proposals", "result", "edit"];
    const safe = fragile.includes(saved.step)
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

## Conséquence UX

Après navigation aller-retour depuis l'étape 3 :
- L'utilisatrice retombe sur l'étape 2 (Format) avec son format présélectionné, son sujet et son objectif restaurés.
- Un clic sur "Suivant" relance proprement la génération des questions.
- Les boutons retour/avant fonctionnent à nouveau.

## Hors scope

- Pas de persistance de `questions[]` / `structureProposal` (ça impliquerait des changements dans `useContentGenerator` et risquerait de servir des questions périmées).
- Pas de changement visuel.
- Pas de modification du stepper.
