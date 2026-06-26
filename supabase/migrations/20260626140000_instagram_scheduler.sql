-- ─── Planification de publication Instagram sur les posts du calendrier ───
-- Colonnes de programmation sur calendar_posts.
alter table public.calendar_posts
  add column if not exists scheduled_publish_at timestamptz,
  add column if not exists auto_publish boolean not null default false,
  add column if not exists publish_status text,          -- null | 'scheduled' | 'publishing' | 'published' | 'failed'
  add column if not exists published_post_id text,
  add column if not exists publish_error text,
  add column if not exists published_at timestamptz;

-- Index partiel pour la requête du job (posts dus, en attente).
create index if not exists idx_calendar_posts_due_publish
  on public.calendar_posts (scheduled_publish_at)
  where auto_publish = true and publish_status = 'scheduled';

-- Extensions (idempotent — déjà présentes via les emails).
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Fonction appelée par le cron : invoque l'edge function de publication programmée
-- avec la clé service-role en bearer (même pattern que les emails, cf on_profile_created_email).
create or replace function public.trigger_publish_due_posts()
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  _service_role_key text;
  _supabase_url text;
begin
  select decrypted_secret into _service_role_key
  from vault.decrypted_secrets
  where name = 'supabase_service_role_key'
  limit 1;

  if _service_role_key is null then
    begin
      _service_role_key := current_setting('supabase.service_role_key', true);
    exception when others then
      raise warning 'Cannot get service_role_key for scheduled publish';
      return;
    end;
  end if;

  _supabase_url := coalesce(
    current_setting('supabase.url', true),
    'https://fhdyflgojppwgrscmtdp.supabase.co'
  );

  perform extensions.http_post(
    url := _supabase_url || '/functions/v1/social-publish-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    ),
    body := '{}'::jsonb
  );
exception when others then
  raise warning 'trigger_publish_due_posts failed: %', sqlerrm;
end;
$$;

-- Planifie le job toutes les 5 minutes. ENTIÈREMENT défensif : si pg_cron n'est pas
-- accessible à ce rôle de migration, on n'échoue PAS la migration (les colonnes + la
-- fonction doivent passer quoi qu'il arrive ; le cron sera mis en place autrement).
do $$
begin
  begin
    perform cron.unschedule('publish-due-instagram');
  exception when others then null;
  end;
  perform cron.schedule(
    'publish-due-instagram',
    '*/5 * * * *',
    'select public.trigger_publish_due_posts();'
  );
exception when others then
  raise warning 'pg_cron scheduling unavailable in migration: %', sqlerrm;
end $$;
