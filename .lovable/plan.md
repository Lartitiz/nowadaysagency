## Problème
Dans `supabase/functions/deep-diagnostic/index.ts`, le bloc `if (!isOnboarding)` (lignes 442-450) appelle `logUsage` 3 fois d'affilée via `Promise.all`, ce qui décompte 3 crédits pour un seul diagnostic relancé depuis le dashboard.

## Fichier impacté
- `supabase/functions/deep-diagnostic/index.ts`

## Changement
Remplacer les 3 appels `logUsage` identiques par un seul appel direct (sans `Promise.all`), conservé dans `fastSaves.push(...)`.

```typescript
if (!isOnboarding) {
  fastSaves.push(
    logUsage(userId, "audit", "deep_diagnostic", undefined, "claude-sonnet", workspaceId)
      .catch(e => console.error("logUsage failed:", e))
  );
}
```

## Ce qui reste inchangé
- La condition `if (!isOnboarding)`
- L'insertion `audit_recommendations` juste au-dessus
- La structure `fastSaves` / `Promise.allSettled(fastSaves)`
- `checkQuota` ligne 117
- La phase 2 enrichissement branding

## Validation
1. `npx tsc --noEmit --skipLibCheck` sans erreur.
2. `grep -c 'logUsage' supabase/functions/deep-diagnostic/index.ts` retourne le nombre attendu (diminué de 2).
3. Déploiement de la fonction edge.