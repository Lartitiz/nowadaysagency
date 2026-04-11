

## Diagnostic

Les questions sont generees par deux prompts distincts selon le format :

1. **`creative-flow/index.ts`** (L242-275) : pour les posts LinkedIn, newsletters, captions Instagram
2. **`carousel-ai/index.ts`** (`buildDeepeningQuestionsPrompt`, L891-944) : pour les carrousels

Le prompt `creative-flow` demande "2 questions ouvertes" avec des regles generiques ("demande des scenes, des moments"). Le prompt `carousel-ai` est plus structure (3 questions, au moins 1 sur le "pourquoi profond", adaptation au branding).

Le probleme principal : le prompt `creative-flow` est trop court et manque de guidage specifique. Il produit des questions "coaching generique" au lieu de questions pointues liees au sujet.

## Plan — Ameliorer la pertinence des questions

### Etape 1 — Renforcer le prompt questions dans `creative-flow/index.ts` (L242-275)

Réécrire le bloc `step === "questions"` pour :

- **Passer de 2 a 3 questions** (comme carousel-ai)
- **Ajouter une regle "POURQUOI PROFOND"** : au moins 1 question doit creuser la reflexion de fond, pas juste l'anecdote
- **Integrer le branding** : si on a le contexte branding (deja disponible via `brandCtx`), l'injecter pour personnaliser les questions a son activite et sa cible
- **Ajouter des anti-patterns explicites** : interdire les questions "coaching de vie" comme "Raconte-moi une situation concrete ou tu as vu quelqu'un perdre son audience" (trop abstraites, trop eloignees du sujet)
- **Ajouter des exemples de bonnes vs mauvaises questions** dans le prompt pour guider le modele
- **Adapter au canal** : questions plus professionnelles pour LinkedIn, plus emotionnelles pour Instagram

Modifications concretes dans le systemPrompt :
```
- "Pose exactement 2 questions" → "Pose exactement 3 questions"
- Ajouter: "AU MOINS 1 question sur 3 doit creuser le POURQUOI PROFOND"
- Ajouter: "INTERDIT: questions de coaching generique deconnectees du sujet"
- Ajouter: bloc branding si disponible
- Ajouter: exemples de bonnes/mauvaises questions
```

### Etape 2 — Injecter le contexte branding dans `creative-flow` questions

Verifier que `brandCtx` (deja construit plus haut dans la fonction) est bien passe dans le prompt questions. Actuellement le bloc questions ne l'utilise pas alors que le bloc `generate` le fait.

### Rien d'autre ne change

- Le prompt `carousel-ai` est deja bien structure (3 questions, pourquoi profond, branding) → pas de modification
- Le format JSON de retour reste identique
- Le frontend (`CreerStepQuestions.tsx`) n'a pas besoin de changement (il affiche deja les questions dynamiquement)

### Verification

- grep pour confirmer les nouvelles regles
- Test en generant un contenu pour verifier la qualite des questions

