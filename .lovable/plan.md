

## Plan : Fix du mode démo Auriana — le state est effacé au chargement

### Cause racine

Quand le bouton démo fait `saveFlowState({...AURIANA_DEMO_FLOW})` puis `navigate("/creer")`, CreerUnifie charge et exécute cette logique :

```text
existingFlowState.step === "idea"
→ shouldRestore = false
→ useEffect cleanup → clearFlowState() + reset ideaText = ""
→ ideaText !== AURIANA_DEMO_SUBJECT → bypass demo ignoré → appels IA normaux
```

### Correction (2 fichiers, ~5 lignes)

**1. `src/lib/demo-auriana-data.ts`**
- Changer `step: "idea"` en `step: "format"` dans `AURIANA_DEMO_FLOW`
- Ainsi `existingFlowState.step !== "idea"` sera vrai, `shouldRestore = true`, et le state sera restauré correctement

**2. `src/pages/CreerUnifie.tsx`**
- Dans la logique de restauration (`safeStep`), le step `"format"` est déjà supporté, donc le flow reprendra à l'étape format avec le sujet pré-rempli
- Vérifier que `ideaText` est bien restauré depuis le persisted state (c'est déjà le cas via `ps?.ideaText`)

### Résultat attendu
- Clic sur "Lancer la démo" → `/creer` charge avec `ideaText = AURIANA_DEMO_SUBJECT` et `step = "format"`
- L'utilisatrice voit le format pré-sélectionné, clique Next → `handleFormatNext` détecte le demo email + subject → résultat instantané
- Aucun appel IA

