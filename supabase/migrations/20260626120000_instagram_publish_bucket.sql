-- Bucket public pour héberger les images à publier sur Instagram (notamment les
-- slides de carrousel rendues en PNG). Instagram va chercher (cURL) les images au
-- moment de la publication : elles doivent donc être accessibles à une URL publique.
insert into storage.buckets (id, name, public)
values ('instagram-publish', 'instagram-publish', true)
on conflict (id) do nothing;

-- Lecture publique : Instagram doit pouvoir récupérer l'image sans authentification.
create policy "Public read instagram-publish"
on storage.objects for select
using (bucket_id = 'instagram-publish');

-- Upload : un utilisateur authentifié écrit uniquement dans son propre dossier
-- (préfixe du chemin = son user id), comme le bucket calendar-media.
create policy "Authenticated upload instagram-publish"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'instagram-publish'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Suppression de ses propres fichiers (nettoyage après publication).
create policy "Owner delete instagram-publish"
on storage.objects for delete to authenticated
using (
  bucket_id = 'instagram-publish'
  and (storage.foldername(name))[1] = auth.uid()::text
);
