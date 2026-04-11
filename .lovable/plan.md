

## Diagnostic

L'UPDATE principal est **déjà fait** : `onboarding_completed = true` et `welcome_seen = true` sont en place depuis le correctif précédent. Auriana ne devrait plus être bloquée sur `/onboarding`.

Le seul delta par rapport à ton prompt : `level` est à `'beginner'` au lieu de `'intermediate'`.

## Plan

### Étape unique — Mettre `level` à `intermediate`

```sql
UPDATE public.user_plan_config
SET level = 'intermediate',
    onboarding_completed_at = now()
WHERE user_id = 'e8a92ea6-b2b5-4fd3-ad4e-4f5f58f3cda7';
```

### Vérification

Requête SELECT pour confirmer les 4 champs (`profile_done`, `config_done`, `welcome_seen`, `level = 'intermediate'`).

### Aucun fichier code modifié

