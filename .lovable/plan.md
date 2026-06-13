## Contexte

Le diagnostic de fin d'onboarding est un moment d'accueil offert, mais il consomme aujourd'hui 3 crédits (via 3 appels à `logUsage` dans `supabase/functions/deep-diagnostic/index.ts`). Une nouvelle utilisatrice free arrive sur son dashboard avec 27/30 crédits sans avoir rien généré.

## Ce qui va être modifié

### Fichier unique
- `supabase/functions/deep-diagnostic/index.ts`

### Changement
Rendre le bloc `logUsage` (lignes 442–448) conditionnel à `!isOnboarding` :

```typescript
// AVANT (lignes 442-448)
fastSaves.push(
  Promise.all([
    logUsage(...),
    logUsage(...),
    logUsage(...),
  ]).catch(...)
);

// APRÈS
if (!isOnboarding) {
  fastSaves.push(
    Promise.all([
      logUsage(...),
      logUsage(...),
      logUsage(...),
    ]).catch(...)
  );
}
```

## Ce qui reste inchangé

- Le `checkQuota` conditionnel ligne 117 (`if (!isOnboarding)`) : ne pas y toucher.
- L'insertion de `audit_recommendations` (le `fastSaves.push` précédent) : continue à s'exécuter dans tous les cas, onboarding inclus.
- La structure `fastSaves` / `await Promise.allSettled(fastSaves)` : identique, seul l'ajout devient conditionnel.
- La phase 2 d'enrichissement branding (fire-and-forget) qui suit : inchangée.
- La signature de `logUsage` et le fichier `plan-limiter.ts` : ne pas toucher.

## Critères de validation

1. `npx tsc --noEmit --skipLibCheck` passe sans erreur.
2. Test manuel : onboarding complet avec un compte free → dashboard affiche 30/30 crédits.
3. Test manuel : audit relancé depuis le dashboard → décompte habituel de 3 crédits s'applique toujours.

## Proposition d'amélioration (à valider séparément — NE PAS implémenter sans accord)

Hors onboarding, le bloc appelle `logUsage` 3 fois pour un seul diagnostic. Si l'intention métier est qu'un diagnostic coûte 1 crédit (et non 3), il faudrait réduire à un seul appel. C'est un sujet de pricing distinct du fix demandé ci-dessus. Je ne l'implémenterai que sur validation explicite de ta part.