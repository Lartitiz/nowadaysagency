

## Plan : Demo Auriana — parcourir toutes les étapes

### Probleme
Actuellement, `handleFormatNext` detecte le compte Auriana et saute directement au resultat. L'utilisatrice veut pouvoir montrer chaque etape (format → questions → resultat) avec les donnees pre-remplies, sans appel IA.

### Changements

**1. `src/lib/demo-auriana-data.ts`**
- Changer `step: "idea"` (actuellement `"format"`) pour demarrer a l'etape `"idea"` — l'utilisatrice voit d'abord le champ sujet pre-rempli et clique "Suivant"

**2. `src/pages/CreerUnifie.tsx`** (~15 lignes)

a) **Supprimer le bypass dans `handleFormatNext`** (lignes 434-447) : ne plus sauter au resultat. Le flow normal continue vers `generateQuestions` → mais on intercepte la generation de questions.

b) **Intercepter `generateQuestions`** : juste apres le `resetGenerator()` + `setStep("questions")` (lignes 542-544), ajouter une detection Auriana. Si c'est le compte demo avec le bon sujet, au lieu d'appeler `generateQuestions(...)`, injecter directement les questions pre-definies depuis `AURIANA_DEMO_FLOW.questions` dans le state du generator (via un nouveau setter ou en appelant directement le state).

c) **Pre-remplir les reponses** : dans `CreerStepQuestions`, les reponses sont gerees par un state local `answers`. On peut passer les `AURIANA_DEMO_FLOW.answers` comme `initialAnswers` prop pour que les champs soient deja remplis quand l'utilisatrice arrive sur cette etape.

d) **Garder le bypass dans `doGenerate`** (lignes 590-600) : quand l'utilisatrice clique "Generer" depuis les questions, le resultat pre-calcule est retourne instantanement. Ce bypass reste tel quel.

**3. `src/components/creer/CreerStepQuestions.tsx`** (~3 lignes)
- Ajouter une prop `initialAnswers?: Record<string, string>` 
- Initialiser le state `answers` avec `initialAnswers` au lieu de `{}`

### Flux final
1. Clic "Lancer la demo" → `/creer` avec sujet pre-rempli (etape "idea")
2. Clic Suivant → etape "format" avec Instagram/Carousel pre-selectionne
3. Clic Suivant → etape "questions" avec 3 questions + reponses pre-remplies
4. Clic "Generer" → etape "result" avec carrousel instantane (2.5s fake delay)
5. Zero appel IA a chaque etape

### Detail technique pour les questions
Le hook `useContentGenerator` expose `questions` et `loadingQuestions`. Pour le demo, on a besoin soit :
- D'un setter `setQuestions` expose par le hook (a ajouter, ~2 lignes dans `use-content-generator.ts`)
- Ou d'appeler le hook avec les questions pre-definies

Je vais verifier le hook pour choisir la meilleure approche.

