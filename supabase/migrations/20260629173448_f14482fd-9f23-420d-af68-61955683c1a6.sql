drop policy if exists "Owner read instagram-publish" on storage.objects;
create policy "Owner read instagram-publish"
on storage.objects for select to authenticated
using (
  bucket_id = 'instagram-publish'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Authenticated upload instagram-publish" on storage.objects;
create policy "Authenticated upload instagram-publish"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'instagram-publish'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Owner delete instagram-publish" on storage.objects;
create policy "Owner delete instagram-publish"
on storage.objects for delete to authenticated
using (
  bucket_id = 'instagram-publish'
  and (storage.foldername(name))[1] = auth.uid()::text
);