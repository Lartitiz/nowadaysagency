## Diagnostic

Quand on clique « Rédiger » depuis la boîte à idées (`/idees`), `handleRediger` dans `IdeasPage.tsx` redirige vers :

```
/creer?theme=…&angle=…&format=…&canal=…&objectif=…&idea_id=…
```

Mais `CreerUnifie.tsx` ne lit **jamais** `theme` — il attend `sujet` (ou `subject`). Conséquence :
- `paramSujet` = "" → `subject.trim()` est faux
- L'init tombe dans le fallback `setStep("format")` (sans sujet, sans angle propagé proprement)
- L'utilisatrice voit "Comment tu veux en parler ? L'outil choisit pour moi"
- En cliquant, `handleFormatNext` lance `generateQuestions({ subject: "" })` → la edge function refuse / renvoie 0 question → écran qui paraît bloqué

L'angle passé en query param (`angle=…`) n'est pas non plus pris en compte dans cette branche.

## Correctifs

### 1. `src/pages/IdeasPage.tsx` — corriger les noms de paramètres

Dans `handleRediger`, renommer pour matcher ce que `CreerUnifie` attend :
- `theme` → `sujet`
- garder `angle`, `format`, `canal`, `objectif`, `idea_id`

```ts
const params = new URLSearchParams({
  sujet: idea.titre,
  angle: idea.angle,
  format: idea.format,
  canal: idea.canal,
  objectif: idea.objectif || "",
  idea_id: idea.id,
});
```

### 2. `src/pages/CreerUnifie.tsx` — propager l'angle issu des query params

Aujourd'hui `paramAngle` n'existe pas. Ajouter :
- `const paramAngle = searchParams.get("angle");`
- Dans le bloc `if (fmt && subject.trim())` (ligne ~390) : si `paramAngle` est défini et qu'aucun `calendarAngle` n'est trouvé, l'utiliser et passer directement à `handleFormatNext(fmt, paramAngle, { overrideSubject: enrichedSubject })`. Comme un angle est déjà choisi côté boîte à idées, on saute l'étape « Comment tu veux en parler ? » et on enchaîne sur les questions.
- Conserver l'exception existante carousel/post quand `!locState?.fromCalendar` **uniquement si** `paramAngle` est absent — sinon on enchaîne directement (l'utilisatrice a déjà fait son choix d'angle dans la boîte à idées).

### 3. (Optionnel mais cohérent) — rendre l'init defensive

Si `subject` est vide mais `fmt` est défini, ne pas essayer d'aller plus loin que `step === "format"` ; afficher un message si possible. (Garde-fou pour éviter des futurs cas similaires.)

## Vérif

1. Aller sur `/idees`, cliquer « Rédiger » sur une idée → on doit arriver directement à l'étape « questions » avec le sujet rempli et l'angle pré-choisi.
2. Vérifier que cliquer « Rédiger » sur une idée sans angle (cas rare) renvoie sur l'étape format avec le sujet pré-rempli, pas sur un écran vide.
3. Console : vérifier qu'aucune requête `creative-flow` ou `carousel-ai` n'est envoyée avec `subject: ""`.

## Fichiers touchés

- `src/pages/IdeasPage.tsx` (handler `handleRediger`)
- `src/pages/CreerUnifie.tsx` (lecture query params + branchement init)
