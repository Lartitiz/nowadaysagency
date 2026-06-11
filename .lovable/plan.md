## Problème

Sur `/branding/charter`, l'`ErrorBoundary` se déclenche avec **"Cannot read properties of null (reading 'useContext')"**. La cause vraie remonte plus haut dans la console :

```
React has detected a change in the order of Hooks called by SessionProvider.
   Previous render            Next render
   ------------------------------------------------------
1. useContext                 useContext
2. useContext                 useContext
3. useContext                 useState
```

C'est une **violation des Rules of Hooks** dans `src/hooks/use-workspace-query.ts` (`useWorkspaceFilter`, `useWorkspaceId`, `useProfileUserId`). Ces hooks appellent conditionnellement `useAuth()` :

```ts
export function useWorkspaceFilter() {
  try {
    const { activeWorkspace } = useWorkspace();           // useContext #1 — toujours
    if (activeWorkspace?.id) return { ... };              // ← early return
  } catch { /* fallback */ }
  const { user } = useAuth();                              // useContext #2 — conditionnel !
  return { column: "user_id", value: user?.id ?? "" };
}
```

Tant que `activeWorkspace` est vide (premier render), React voit 2 `useContext` dans cette fonction. Dès que le workspace arrive (render suivant), le early-return saute le `useAuth()` → l'ordre des hooks change → React part en vrille et crash le sous-arbre, ce qui produit l'erreur générique vue par l'utilisatrice.

Le même problème existe dans `useWorkspaceId` (même pattern try / early-return / useAuth après) et dans `useProfileUserId` (try/catch autour de `useWorkspace()`, le `useQuery` enchaîné garde un ordre stable mais le crash de l'ancêtre suffit à casser la page).

`useWorkspaceFilterWithFallback` au bas du fichier appelle déjà `useAuth()` **avant** le try/catch — c'est la forme correcte, on s'en sert comme modèle.

## Correctif

**`src/hooks/use-workspace-query.ts`** — toujours appeler `useAuth()` et `useWorkspace()` (via un wrapper safe) **en haut** de chaque hook, puis choisir la valeur retournée. Aucun appel de hook ne doit dépendre d'une branche conditionnelle.

1. `useWorkspaceId` :
   ```ts
   const { user } = useAuth();
   let activeWorkspaceId: string | undefined;
   try { activeWorkspaceId = useWorkspace().activeWorkspace?.id; } catch {}
   return activeWorkspaceId ?? user?.id ?? "";
   ```

2. `useWorkspaceFilter` : pareil — `useAuth()` d'abord, puis tentative `useWorkspace()`, puis choix.

3. `useProfileUserId` : retirer la branche conditionnelle qui repousse `useAuth` après le try/catch. L'ordre devient `useAuth → useWorkspace (try/catch sans early-return) → useQuery`. `useQuery` est déjà appelé inconditionnellement grâce à `enabled: isManager`, donc rien d'autre à toucher.

4. Laisser `useWorkspaceFilterWithFallback` tel quel (déjà conforme).

## Vérification

- Recharger `/branding/charter` après le fix → la page rend sans tomber dans l'ErrorBoundary.
- Console du navigateur : plus d'avertissement "change in the order of Hooks called by SessionProvider".
- Naviguer vers d'autres pages utilisant ces hooks (calendrier, créer, identité de marque) → aucune régression visuelle.

## Hors scope

- Le warning Tailwind `duration-[300ms]` ambigu vu dans les logs Vite : cosmétique, sans rapport.
- Le re-render lent du préchargement Google Fonts dans `CharterTypographySection` : non lié au crash.
