## Plan — Corriger le blocage RLS sur les photos

### Ce que j’ai confirmé

Le problème arrive avant même la retouche IA : aucun enregistrement `user_photos` n’est créé, donc le blocage se produit sur l’insert initial côté front.

Points confirmés dans le code :
- `uploadPhotoOriginal()` insère dans `public.user_photos` avec `user_id` et `workspace_id` avant l’upload storage.
- La policy actuelle d’insert sur `user_photos` vérifie seulement `user_has_workspace_access(workspace_id)`.
- Le toast affiché dans ta capture (`new row violates row-level security policy`) est cohérent avec un rejet RLS sur cet insert.
- Il n’y a pas encore de ligne récente dans `user_photos`, ce qui confirme que ça casse au tout début du flux.

### Hypothèse la plus probable

La policy d’insert de `user_photos` est trop permissive sur le mauvais axe : elle valide l’accès au workspace, mais elle ne verrouille pas explicitement que `user_id = auth.uid()`.

Dans ce projet, d’autres tables workspace-scoped utilisent déjà le pattern robuste suivant :
- autoriser si `auth.uid() = user_id`
- ou si `user_has_workspace_access(workspace_id)` selon le besoin métier

Pour un upload photo initié par l’utilisateur connecté, le plus sûr est d’exiger les deux cohérences :
- `workspace_id` accessible
- `user_id = auth.uid()`

### Correctif proposé

1. Ajouter une migration ciblée sur `public.user_photos`
   - remplacer la policy `workspace_insert_user_photos`
   - nouvelle règle :
     - `auth.uid() = user_id`
     - `AND public.user_has_workspace_access(workspace_id)`

2. Renforcer aussi les policies UPDATE/DELETE si nécessaire
   - vérifier si elles doivent également imposer `auth.uid() = user_id` pour les actions initiées côté client
   - garder inchangé ce qui doit rester workspace-shared pour la lecture

3. Améliorer le message côté front
   - dans `uploadPhotoOriginal()`, conserver la traduction d’erreur RLS en message clair
   - optionnellement élargir la détection pour couvrir les variantes de message Postgres/RLS et éviter le brut technique dans les toasts

4. Validation après correction
   - tester un upload photo depuis le compte connecté
   - vérifier qu’une ligne `user_photos` est bien créée avec `status = 'pending'`
   - vérifier que l’upload storage part ensuite normalement
   - vérifier qu’en cas de workspace partagé, l’insert reste autorisé pour le membre connecté si `user_id` est bien son propre id

### Détails techniques

Changement prévu :
```sql
DROP POLICY IF EXISTS workspace_insert_user_photos ON public.user_photos;

CREATE POLICY workspace_insert_user_photos ON public.user_photos
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND public.user_has_workspace_access(workspace_id)
);
```

Lecture à conserver telle quelle :
```sql
user_has_workspace_access(workspace_id)
```

Pourquoi ce fix est le bon :
- il aligne `user_photos` sur le pattern RLS déjà utilisé ailleurs dans le projet
- il évite les inserts incohérents
- il sécurise sans casser le modèle workspace

### Hors périmètre

Je ne toucherai pas dans ce chantier :
- au flux `photo-background-replace`
- aux buckets/policies storage si l’insert DB redevient fonctionnel
- aux autres modules workspace

### Point d’attention

Si après ce correctif l’erreur persiste, le second suspect sera le mode démo : `/photos` semble accessible via route protégée classique, mais l’app a un faux user `demo-user` dans certains cas. Dans ce cas, il faudra ajouter un garde-fou explicite pour désactiver l’upload photo en démo avec un message propre au lieu de laisser partir une requête RLS.