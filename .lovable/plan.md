## Objectif

Sécuriser l'avancement au step 3 de l'onboarding (choix produits/services/les deux) en ajoutant un bouton "Suivant" de filet de sécurité, tout en conservant l'auto-next existant.

## Problème actuel

Le step 3 (`ProductServiceScreen`) n'a aucun bouton "Suivant". L'avancement dépend uniquement d'un `useEffect` auto-next (400ms après le clic). Si cet auto-next échoue (re-render, démontage rapide), l'utilisateur est bloqué sans moyen d'avancer. Les steps 6/7/8 ont le même auto-next mais disposent d'un validator en backup ; le step 3 n'en a pas.

## Implémentation

### 1. ProductServiceScreen — ajout du bouton de secours

Fichier : `src/components/onboarding/steps/ProductServiceScreen.tsx`

- Ajouter une prop optionnelle `onNext?: () => void` dans l'interface `Props`.
- Quand `value` est non vide (une option sélectionnée), afficher un bouton "Suivant →" centré en dessous des options.
- Style du bouton : `rounded-full px-8`, identique visuellement à ceux des autres steps (via le composant `Button` existant ou classes Tailwind équivalentes).
- Le bouton appelle `onNext()` au clic.
- L'auto-next via `onChange` reste inchangé (il est déclenché par le parent).

### 2. Onboarding — passage de la prop onNext

Fichier : `src/pages/Onboarding.tsx`

- Sur la ligne du `step === 3`, passer `onNext={validatedNext}` au `ProductServiceScreen`.
- Le `onChange` existant (`set("product_or_service", v); setPendingAutoNext(true)`) reste inchangé.
- Le mécanisme `pendingAutoNext` / `useEffect` reste inchangé.

## Ce qui ne bouge pas

- Le mécanisme `pendingAutoNext` / `useEffect` dans `Onboarding.tsx`.
- Le `onChange` existant (set product_or_service + setPendingAutoNext(true)).
- Le style des cards d'options.
- Les autres steps (6/7/8 et au-delà).
- Les validators steps 9/10 (hors scope, plan séparé).
- Refacto des autres auto-next (hors scope).

## Critères de validation

1. `npx tsc --noEmit --skipLibCheck` passe sans erreur.
2. Test manuel : sélectionner une option au step 3 → l'auto-next avance (comportement existant préservé).
3. Test manuel : un bouton "Suivant" est visible après sélection et fonctionne aussi si l'auto-next échoue.