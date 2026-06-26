-- Bucket public pour déposer le PPTX d'un carrousel le temps que Canva l'importe
-- (l'API d'import Canva récupère le fichier via une URL publique HTTPS).
-- Modèle identique à instagram-publish : public en lecture, écriture/suppression
-- par l'utilisateur dans son propre dossier (préfixe user_id).

insert into storage.buckets (id, name, public)
values ('canva-import', 'canva-import', true)
on conflict (id) do nothing;

create policy "Public read canva-import"
on storage.objects for select
using (bucket_id = 'canva-import');

create policy "Authenticated upload canva-import"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'canva-import'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Owner delete canva-import"
on storage.objects for delete to authenticated
using (
  bucket_id = 'canva-import'
  and (storage.foldername(name))[1] = auth.uid()::text
);
