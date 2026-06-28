create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

delete from public.email_queue
where sent = false and coalesce(cancelled, false) = false
  and scheduled_at < now() - interval '7 days';

create or replace function public.trigger_email_event(_event text)
returns void language plpgsql security definer set search_path = 'public' as $$
declare
  _service_role_key text;
  _supabase_url text;
begin
  select decrypted_secret into _service_role_key
  from vault.decrypted_secrets where name = 'supabase_service_role_key' limit 1;
  if _service_role_key is null then
    begin _service_role_key := current_setting('supabase.service_role_key', true);
    exception when others then raise warning 'Cannot get service_role_key for email cron'; return; end;
  end if;
  _supabase_url := coalesce(current_setting('supabase.url', true), 'https://fhdyflgojppwgrscmtdp.supabase.co');
  perform extensions.http_post(
    url := _supabase_url || '/functions/v1/email-trigger',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || _service_role_key),
    body := jsonb_build_object('event', _event)
  );
exception when others then raise warning 'trigger_email_event(%) failed: %', _event, sqlerrm;
end; $$;

do $do$
begin
  begin perform cron.unschedule('email-process-queue'); exception when others then null; end;
  begin perform cron.unschedule('email-check-inactive'); exception when others then null; end;
  begin perform cron.unschedule('email-check-credits');  exception when others then null; end;
  perform cron.schedule('email-process-queue', '*/15 * * * *', $c$select public.trigger_email_event('process_queue');$c$);
  perform cron.schedule('email-check-inactive', '0 8 * * *',   $c$select public.trigger_email_event('check_inactive');$c$);
  perform cron.schedule('email-check-credits',  '30 8 * * *',  $c$select public.trigger_email_event('check_credits');$c$);
exception when others then raise warning 'pg_cron scheduling unavailable in migration: %', sqlerrm;
end $do$;