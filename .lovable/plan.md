## Scope
Modifier UNIQUEMENT la constante `PROGRESS_MESSAGES` dans `src/components/creer/CreerStepResult.tsx`.

## Changement
Ajouter une entrée `linkedin` (avant `default`) avec 5 messages dédiés qui reflètent les 2 passes IA (rédaction + relecture anti-tics) :

```text
linkedin: [
  "Rédaction de ton post LinkedIn…",
  "Personnalisation avec ta voix…",
  "Passe de relecture : chasse aux tics d'écriture IA…",
  "Vérification du rythme et des accroches…",
  "Derniers ajustements…",
],
```

## Ce qui ne change pas
- Toutes les autres entrées (`carousel`, `reel`, `story`, `pinterest_*`, `default`)
- La logique de rotation des messages (le `useEffect` utilise déjà la clé de format)
- Le reste du composant et tous les autres fichiers

## Validation
- `npx tsc --noEmit --skipLibCheck` passe sans erreur (ajout d'une clé dans un `Record<string, string[]>`, typage compatible).