## Contexte métier

A la fin de l'onboarding, le diagnostic IA (`deep-diagnostic`, appel Sonnet sur plusieurs sources) peut prendre 60-90s. Or un `safetyTimeout` manuel declenche un fallback generique des 52s, alors que `invokeWithTimeout` est lui regle a 180s.

Resultat : tout diagnostic un peu long est REMPLACE par un calcul local generique (`computeDiagnosticData`), et la personne perd le vrai diagnostic personnalise.

## Fichier impacté

`src/components/onboarding/DiagnosticLoading.tsx` (UNIQUEMENT ce fichier)

## Analyse technique

- `invokeWithTimeout` ne rejette jamais : a son propre timeout (180s) il RESOUT avec `{ data: null, error: { isTimeout: true } }`.
- Le code en aval gere deja ce cas : `if (error || !data) { useFallback(); return; }`.
- Le `safetyTimeout` manuel (52s) fait double emploi avec le timeout interne, mais en BEAUCOUP plus court -> il sabote l'appel reel.

## Changements attendus

1. **Supprimer entierement le mecanisme `safetyTimeout`/`timeoutFired`** (option A retenue) :
   - Supprimer la declaration `let safetyTimeout: ReturnType<typeof setTimeout> | null = null;`
   - Supprimer `let timeoutFired = false;`
   - Supprimer le `setTimeout(..., 52000)` (lignes ~270-274)
   - Supprimer les `clearTimeout(safetyTimeout)` (lignes ~278 et ~300)
   - Supprimer les gardes `if (timeoutFired) return;` (lignes ~279 et ~301)

2. **Reduire le timeout d'`invokeWithTimeout` de 180000 a 120000** (ligne ~276) :
   - 120s est le timeout Opus/audits documente du projet, suffisant pour ce diagnostic et plus raisonnable en UX que 180s d'attente.

## Ce qui NE DOIT PAS bouger

- `useFallback()` et `computeDiagnosticData` : inchanges.
- Le branchement `isDemoMode` en haut de l'effet : inchangé.
- `mapEdgeResponseToDiagnostic`, `buildRevealMessages`, la phase "revealing" : inchanges.
- Le body envoye a l'edge function (`isOnboarding: true`, `workspace_id...`) : inchangé.
- Les messages UI `elapsedSeconds >= 15` / `>= 30` : gardes, ils restent pertinents comme reassurance pendant l'attente.
- `calledRef`, `diagnosticDataRef`, toute la machinerie de phases : inchanges.

## Critères de validation

- `npx tsc --noEmit --skipLibCheck` passe sans erreur.
- Plus aucune occurrence de `52000`, `safetyTimeout` ou `timeoutFired` dans le fichier.
- `invokeWithTimeout(...)` est appele avec `120000` en 3e argument.
- Test manuel : onboarding complet avec un vrai compte (site web renseigne) -> le diagnostic affiche est bien le diagnostic IA personnalise, pas le generique, meme si l'analyse prend ~70-90s.
- Test manuel : couper le reseau pendant l'analyse -> le fallback generique s'affiche correctement (pas d'ecran bloque).

## Hors scope (plans séparés)

- Le decompte 3 credits hors onboarding.
- Le polish onboarding (validators steps 9/10, auto-next step 3, desired_channels).