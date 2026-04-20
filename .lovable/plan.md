

## Diagnostic

Le bouton "Passer les questions, générer directement" appelle `onSkip` mais **ne donne aucun feedback visuel immédiat**. La génération démarre derrière (et `AiLoadingIndicator` s'affichera plus loin dans le flow), mais entre le clic et l'apparition du loader, il y a un trou silencieux → l'utilisateur·ice clique plusieurs fois en pensant que ça bug.

Même chose pour le bouton "Générer" en bas (dernière question / fin de follow-up) : pas de feedback pendant le délai de transition vers l'écran de loading.

## Fix — 1 seul fichier : `src/components/creer/CreerStepQuestions.tsx`

### 1. Ajouter un état `isSubmitting`
```ts
const [isSubmitting, setIsSubmitting] = useState(false);
```

### 2. Wrapper `onSkip` et `onNext` (cas final) pour activer l'état
- `handleSkip` : `setIsSubmitting(true)` puis `onSkip()`
- `handleNext` quand c'est le dernier (génération réelle) : `setIsSubmitting(true)` puis `onNext(answers)`
- Le decline follow-up déclenche aussi `setIsSubmitting(true)`

### 3. Feedback visuel sur les 2 boutons concernés
- **Bouton "Passer les questions"** (ligne ~244) :
  - `disabled={isSubmitting}`
  - Si `isSubmitting` → icône `Loader2` qui spin + texte `"Lancement…"` au lieu de `SkipForward` + texte actuel
- **Bouton "Générer"** (en bas, dans `handleNext` final) :
  - `disabled={isSubmitting}`
  - Si `isSubmitting` → `Loader2` spin + texte `"Lancement…"` au lieu de `Sparkles` + "Générer"
- **Bouton "Précédent"** : aussi `disabled={isSubmitting}` pour éviter retour pendant transition

### 4. Bandeau discret de confirmation (optionnel mais recommandé)
Quand `isSubmitting`, afficher juste sous les boutons un petit texte centré :
> `⚡ Préparation de la génération…`
Pour rassurer pendant les ~500ms-1s avant que `AiLoadingIndicator` du parent prenne le relais.

## Comportement préservé
- Si l'utilisateur·ice annule la génération côté parent et revient sur cet écran → `isSubmitting` est reset (composant démonté/remonté)
- Aucun changement de logique métier, juste du feedback UI

## Validation
1. `tsc --noEmit --skipLibCheck` → 0 erreur
2. Clic sur "Passer les questions" → bouton devient spinner immédiatement, plus de double-clic possible
3. Clic sur "Générer" final → idem
4. Le flow normal (Suivant entre questions) reste instantané, pas de spinner

## Hors scope
- Changement de l'`AiLoadingIndicator` du parent
- Refonte du flow de questions

