
# Plan Photo 2 — Edge Function `photo-background-replace`

## Objectif
Créer la Edge Function qui orchestre la retouche de fond IA via l'API Photoroom (`/v2/edit`).
Cœur backend de la feature : valide l'input, vérifie le quota `photo_retouch`, télécharge la photo originale, appelle Photoroom, ré-upload le résultat, met à jour la DB et logge l'usage.

## Préalable côté user
Ajouter le secret **`PHOTOROOM_API_KEY`** dans les secrets Lovable Cloud (demandé via `add_secret` au début de l'exec, exec bloqué tant que pas fait).

## Fichiers
**Création :**
- `supabase/functions/photo-background-replace/index.ts`

**Modification :**
- `supabase/config.toml` → ajout du bloc `[functions.photo-background-replace]` avec `verify_jwt = false` (pattern projet)

**Aucun autre fichier touché.** Pas de migration DB (table + bucket déjà créés au Plan 1). Pas de frontend (Plan 3).

## Contrat d'API

### Input (Zod)
```ts
{
  photo_id: string (uuid, required),
  workspace_id: string (uuid, optional),
  background_prompt: string (3-500 chars, optional),
  background_preset_key: string (max 100, optional),
}
// refine: au moins background_prompt OU background_preset_key requis
```

Le client (Plan 3) aura déjà :
1. Uploadé la photo originale dans le bucket à `{user_id}/{photo_id}_original.jpg`
2. Inséré la row `user_photos` avec `status='pending'`, `original_storage_path` rempli, `workspace_id` correct

### Output succès (200)
```json
{ "success": true, "photo_id": "...", "storage_path": "user_id/photo_id.jpg", "remaining": 4 }
```

### Codes erreur
| Code | Cas |
|---|---|
| 400 | Body Zod invalide |
| 401 | Pas d'auth (via pipeline) |
| 403 | Demo user OU photo appartient à un autre user OU workspace_id du body ≠ workspace_id de la photo |
| 404 | photo_id introuvable |
| 409 | Photo déjà `ready` ou `processing` (anti-doublon) |
| 429 | Quota `photo_retouch` épuisé OU rate limit (10/min) |
| 502 | Échec Photoroom (avec error_message friendly) |
| 500 | Échec download/upload bucket |

## Pipeline (ordre strict)

1. **`runPipeline()`** avec `category: "photo_retouch"`, `workspaceId`, `rateLimit: { max: 10, windowMs: 60_000 }`
2. **Parse + valider** body (Zod)
3. **Fetch `user_photos`** par `photo_id` → 404 si absent
4. **Sécurité (amélioration E)** :
   - `photo.user_id === userId` → sinon 403
   - Si `body.workspace_id` fourni : `photo.workspace_id === body.workspace_id` → sinon 403
   - `photo.status NOT IN ('processing', 'ready')` → sinon 409 (autorise `pending` et `failed` pour permettre retry)
5. **Marquer `processing`** dans DB
6. **Download original** depuis bucket (`photo.original_storage_path`)
7. **Construire le prompt final** : `PRESET_PROMPTS[preset_key] ?? background_prompt` (PRESET_PROMPTS = `{}` vide en v1, rempli au Plan 5)
8. **Appel Photoroom `/v2/edit`** :
   - URL : `https://image-api.photoroom.com/v2/edit`
   - Header : `x-api-key: PHOTOROOM_API_KEY`
   - FormData : `imageFile`, `background.prompt`, `segmentation.mode=auto`, `outputSize=originalImage`
   - Timeout : `AbortSignal.timeout(60_000)`
9. **Amélioration A — Retry 1x sur 5xx** :
   - Si `status >= 500` ou `TimeoutError` : attendre 2s, refaire l'appel 1 fois
   - Si retry échoue aussi → `markFailed` + 502
   - 401, 429, 4xx autres → pas de retry, fail direct
10. **Mapping erreurs friendly** :
    - 401 → "Clé API Photoroom invalide" (côté config, on logge en console.error)
    - 429 → "Limite Photoroom atteinte, réessayez dans 1 min"
    - 5xx → "Photoroom temporairement indisponible"
    - autres → "Erreur Photoroom (status N)"
11. **Upload résultat** : `{userId}/{photo_id}.jpg` dans bucket `user-photos` avec `upsert: true`
12. **Update DB final** : `status='ready'`, `storage_path`, `background_prompt`, `background_preset_key`, `file_size_bytes`, `error_message=null`
13. **`logUsage()`** : category `photo_retouch`, action `background_replace`, model_used `photoroom-v2`
14. **Amélioration D — Log structuré** :
    ```ts
    console.log(JSON.stringify({
      event: "photo_retouch_success",
      photo_id, user_id, workspace_id,
      photoroom_ms: timing,
      input_bytes: blob.size,
      output_bytes: resultBlob.size,
      retry_used: retried,
    }));
    ```
15. **Retour 200** avec `remaining` du quota

## Helper interne `markFailed(photoId, errorMessage)`
Update `user_photos` → `status='failed'`, `error_message=errorMessage`. **Pas** de `logUsage` (quota préservé).

## Politique quota explicite
- `runPipeline` vérifie le quota AVANT toute action → si épuisé, 429 et la photo reste `pending` côté DB (le client la voit, peut supprimer/reprendre plus tard)
- `logUsage` n'est appelé QUE après succès Photoroom + upload
- Échec Photoroom (502) ou bucket (500) → quota préservé

## `supabase/config.toml`
Append (sans toucher aux entries existantes) :
```toml
[functions.photo-background-replace]
verify_jwt = false
```

## Ce qui ne bouge pas
- Aucun autre fichier `_shared/*`, aucune autre Edge Function
- Aucune migration DB (table + bucket + policies déjà au Plan 1)
- Aucun frontend (Plan 3)
- Pas de `photo_retouch_logs` séparé (tracking dans `ai_usage`)
- Pas de webhook Photoroom (`/v2/edit` synchrone)
- Pas de simulation mode démo (le pipeline bloque déjà avec 403)
- `PRESET_PROMPTS` reste `{}` vide → rempli au Plan 5

## Critères d'acceptation
1. `supabase functions deploy photo-background-replace` → succès
2. Curl sans auth → 401
3. Curl auth + body invalide → 400 Zod
4. Curl auth + `photo_id` inexistant → 404
5. Curl auth + photo d'un autre user → 403
6. Curl auth + `workspace_id` body ≠ photo.workspace_id → 403 (test amélioration E)
7. Curl auth + photo `ready` → 409
8. Curl auth + photo `pending` valide + prompt → row passe `pending → processing → ready`, fichier visible à `{user_id}/{photo_id}.jpg`, original préservé, row `ai_usage` créée
9. PHOTOROOM_API_KEY invalide → status `failed`, error_message friendly, **pas** de row `ai_usage`
10. User free avec 5/5 retouches déjà ce mois → 429 sans appel Photoroom
11. Logs structurés `photo_retouch_success` visibles dans edge function logs

## Hors scope (plans suivants)
- Plan Photo 3 : UI `/photos` (gallery, upload, edit dialog, retry)
- Plan Photo 4 : intégration `CreerUnifie.tsx`
- Plan Photo 5 : presets de fond (`PRESET_PROMPTS` rempli)
