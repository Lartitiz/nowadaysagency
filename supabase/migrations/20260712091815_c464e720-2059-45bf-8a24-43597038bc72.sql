create or replace function public.trigger_stats_monthly_snapshot()
returns void language plpgsql security definer set search_path = 'public' as $$
declare
  _service_role_key text;
  _supabase_url text;
begin
  select decrypted_secret into _service_role_key
  from vault.decrypted_secrets where name = 'supabase_service_role_key' limit 1;
  if _service_role_key is null then
    begin _service_role_key := current_setting('supabase.service_role_key', true);
    exception when others then raise warning 'Cannot get service_role_key for stats snapshot cron'; return; end;
  end if;
  _supabase_url := coalesce(current_setting('supabase.url', true), 'https://fhdyflgojppwgrscmtdp.supabase.co');
  perform extensions.http_post(
    url := _supabase_url || '/functions/v1/stats-monthly-snapshot',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || _service_role_key),
    body := '{}'::jsonb
  );
exception when others then raise warning 'trigger_stats_monthly_snapshot failed: %', sqlerrm;
end; $$;

do $do$
begin
  begin perform cron.unschedule('stats-monthly-snapshot'); exception when others then null; end;
  perform cron.schedule('stats-monthly-snapshot', '30 4 1 * *',
    $c$select public.trigger_stats_monthly_snapshot();$c$);
exception when others then raise warning 'pg_cron indisponible: %', sqlerrm;
end $do$;