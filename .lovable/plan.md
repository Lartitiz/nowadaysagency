

## Diagnostic

Le probleme est clair et confirme par les requetes reseau et la base :

1. **`workspace_id = NULL` sur toutes les tables** : Les donnees ont ete inserees avec `user_id` uniquement, mais le frontend filtre par `workspace_id = a53faa5c-851e-4994-b0d6-a4aea991a004` (le workspace "Auriana" cree automatiquement). Resultat : toutes les requetes retournent `[]`.

2. **`user_plan_config.onboarding_completed = false`** : L'app affiche l'ecran de bienvenue/onboarding au lieu du dashboard.

## Plan de correction

### Etape 1 -- Patcher le `workspace_id` sur toutes les tables

Executer des UPDATE sur les 10 tables pour ajouter `workspace_id = 'a53faa5c-851e-4994-b0d6-a4aea991a004'` la ou `user_id = 'e8a92ea6-b2b5-4fd3-ad4e-4f5f58f3cda7'` et `workspace_id IS NULL`.

Tables concernees :
- `profiles`
- `storytelling`
- `persona`
- `brand_profile`
- `brand_strategy`
- `user_offers`
- `user_plan_config`
- `calendar_posts`
- `saved_ideas`
- `instagram_audit`
- `voice_profile`

### Etape 2 -- Patcher `user_plan_config`

Mettre `onboarding_completed = true` et `welcome_seen = true` pour qu'Auriana arrive directement sur le dashboard.

### Etape 3 -- Verification

Requete de controle pour confirmer que toutes les tables ont bien `workspace_id` renseigne, puis test en se reconnectant.

### Aucun fichier code modifie

Ce sont uniquement des corrections de donnees en base.

