

## Fix — Erreurs de build : propager `series_id` / `episode_number`

### Diagnostic

La signature de `onSave` (ligne 35 de `CalendarPostDialog.tsx`) exige désormais `series_id` et `episode_number`, mais les 4 appels concrets (lignes 165, 217, 227, 249) construisent encore l'ancien payload sans ces deux champs → 4 erreurs TS2739.

Côté `Calendar.tsx`, le `handleSave` parent (ligne 406) ne déclare pas non plus ces champs dans son type et ne les insère pas en DB.

### Correction

**Fichier 1 — `src/components/calendar/CalendarPostDialog.tsx`**

Ajouter `series_id: seriesId, episode_number: episodeNumber` aux 4 appels `onSave({...})` :
- Ligne 165 (`handleSave`)
- Ligne 217 (`handleOpenAtelier`)
- Ligne 227 (`handleNavigateToGenerator`)
- Ligne 249 (`handleNavigateToDeepen`)

Les variables `seriesId` et `episodeNumber` sont déjà déclarées (lignes 75-76) et hydratées depuis `editingPost` (lignes 103-104).

**Fichier 2 — `src/pages/Calendar.tsx`**

1. Élargir la signature de `handleSave` (ligne 406) pour accepter `series_id?: string | null` et `episode_number?: number | null`.
2. Inclure ces deux champs dans le `payload` (ligne 408) :
```ts
series_id: data.series_id || null,
episode_number: data.episode_number ?? null,
```

Ainsi les valeurs sont persistées en INSERT et UPDATE sur `calendar_posts`.

### Validation

- TypeScript compile (les 4 erreurs TS2739 disparaissent)
- Sélectionner une série dans le dialog + sauver → `series_id` et `episode_number` enregistrés en DB
- Rouvrir le post → la série et le n° d'épisode sont rechargés
- Régression : un post sans série continue de sauver `null` sur les deux champs

### Hors scope

Aucun changement de logique ni de schéma. Pure propagation de deux champs déjà déclarés.

