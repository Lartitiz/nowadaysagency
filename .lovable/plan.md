## Contexte métier

Depuis le fix du retour silencieux à "format", useFormPersist ne touche plus au step. Il ne fait plus que persister/restaurer 5 champs (ideaText, objective, selectedFormat, editorialAngle, answers) déjà entièrement couverts par use-flow-persistence (creer_flow_state). C'est une seconde source de vérité redondante.

Objectif : un seul système de persistance du flow (use-flow-persistence), zéro régression.

## Vérification préalable

`rg "useFormPersist" src/` confirme que le hook n'est consommé QUE par `src/pages/CreerUnifie.tsx`. Le fichier `src/hooks/use-form-persist.ts` n'est référencé nulle part ailleurs.

## Fichiers impactés

- `src/pages/CreerUnifie.tsx` (modifications)
- `src/hooks/use-form-persist.ts` (suppression — plus aucun consommateur)

## Comportement attendu

1. **Retirer l'import** ligne 50 : `import { useFormPersist } from "@/hooks/use-form-persist";`

2. **Retirer l'appel du hook** (lignes 197-212) : tout le bloc `const { restored: draftRestored, clearDraft } = useFormPersist(...)`. `draftRestored` n'est lu nulle part, suppression sans impact.

3. **useEffect "fresh start"** (ligne 219) : retirer `clearDraft();` et ajouter à la place `sessionStorage.removeItem("form_draft_creer-unifie-form");` pour purger d'éventuels résidus d'anciennes sessions. `clearFlowState()` ligne 218 reste.

4. **Reset complet** (ligne 1518) : retirer `clearDraft();`. `clearFlowState()` ligne 1517 couvre déjà tout. Pas besoin d'ajouter la purge sessionStorage ici (déjà fait au mount par le useEffect "fresh start" la prochaine fois).

5. **Supprimer `src/hooks/use-form-persist.ts`** : plus aucun consommateur.

## Ce qui NE DOIT PAS bouger

- `use-flow-persistence.ts` (saveFlowState / loadFlowState / clearFlowState).
- `safeStep` et la logique de restauration du step.
- Le useEffect saveFlowState (~ligne 368).
- Tous les autres `clearFlowState()`.
- Aucun autre comportement du flow.

## Critères de validation

1. `npx tsc --noEmit --skipLibCheck` passe (pas d'import/variable orphelin).
2. Flow complet carrousel de bout en bout → aucune régression, step restauré après F5 (via safeStep).
3. Clic frais "Créer" sans contexte → démarre sur "idea", state vierge, ancienne clé `form_draft_creer-unifie-form` purgée.
4. Reset/recommencer → state nettoyé.

## Proposition d'améliorations (signalée, non implémentée)

Aucune autre page n'utilise useFormPersist — la consolidation est totale avec ce plan.

## Hors scope

- Harmonisation des 429 des autres edge functions.