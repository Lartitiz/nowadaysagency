## Contexte

Tu reçois un message d'erreur dans la boîte de dialogue "Nouvelle photo retouchée" (page `/photos`). Les logs Edge Function `photo-background-replace` sont vides côté serveur, ce qui signifie que **l'erreur survient AVANT l'invocation de PhotoRoom** — donc à l'une de ces étapes :

1. **INSERT en base** dans `user_photos` (bloqué par RLS si `workspace_id` invalide).
2. **Upload du fichier original** dans le bucket `user-photos` (bloqué par les policies storage).
3. **UPDATE de la ligne** avec les chemins finaux.

Une cause très probable : **il manque une policy `UPDATE` sur `storage.objects` pour le bucket `user-photos**`. Or `uploadPhotoOriginal` utilise `upsert: true`, qui requiert le droit UPDATE en plus de INSERT. Si la photo existe déjà (retry après un premier essai partiellement raté), l'upload échoue silencieusement avec un message peu clair.

Autres pistes secondaires :

- Image HEIC (iPhone) → `createImageBitmap` échoue dans Safari → message générique "Échec du lancement".
- Workspace pas encore chargé → message "Espace de travail en cours de chargement…" (peu probable, déjà géré).

## Pour identifier la cause exacte

J'ai besoin du **texte du message d'erreur** affiché dans le toast rouge. Peux-tu me le copier ou m'envoyer une capture d'écran ? new row violate security policy qqch comme ça

En parallèle, voici les corrections à appliquer dès maintenant :

## Correctifs à apporter

### 1. Migration SQL — ajouter la policy UPDATE manquante

Bucket `user-photos` n'a actuellement que les policies INSERT/SELECT/DELETE. Ajouter :

```sql
CREATE POLICY "Users can update own photos" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'user-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

Cela débloquera tout `upsert` sur une photo qui existe déjà (cas du retry).

### 2. `src/lib/photo-storage.ts` — meilleure gestion d'erreur d'upload

Aujourd'hui un échec d'upload affiche le message brut du SDK (souvent cryptique). Détecter les cas typiques :

- `new row violates row-level security policy` → "Espace de travail invalide, recharge la page."
- Permission denied / 403 sur storage → "Impossible d'enregistrer la photo (droits insuffisants)."
- HEIC non supporté → suggérer JPG/PNG.

Et **rollback de la ligne `user_photos**` si l'upload OU l'update final échoue, pour éviter d'accumuler des photos "orphelines" en `pending`.

### 3. `src/components/photos/PhotoUploadDialog.tsx` — validation côté client

Avant d'envoyer :

- Refuser explicitement les `.heic` / `.heif` avec un message clair ("Convertis ta photo en JPG/PNG").
- Refuser les fichiers > 15 Mo avant compression (évite un freeze du navigateur).

### 4. (Optionnel) Logs côté Edge Function

Dans `photo-background-replace`, si l'erreur arrive après l'invocation, on l'aurait vue. Comme aucun log n'apparaît, on confirme que c'est bien un échec frontend/storage. Pas de modification serveur nécessaire pour l'instant.

## Étapes après ton retour

1. Tu me donnes le message d'erreur exact (ou capture).
2. J'applique les correctifs SQL + frontend ci-dessus.
3. On retente un upload pour valider.

Veux-tu que je lance directement les correctifs 1, 2, 3 (ils sont sans risque), ou tu préfères d'abord me partager le message d'erreur ?