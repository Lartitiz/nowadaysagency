ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_ritual_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS weekly_ritual_day SMALLINT NOT NULL DEFAULT 1;

UPDATE public.email_sequences SET is_active = false
WHERE trigger_event = 'weekly_digest'
  AND id <> (SELECT id FROM public.email_sequences
             WHERE trigger_event = 'weekly_digest'
             ORDER BY created_at ASC LIMIT 1);

do $do$
begin
  begin perform cron.unschedule('email-weekly-digest'); exception when others then null; end;
  perform cron.schedule('email-weekly-digest', '15 8 * * *',
    $c$select public.trigger_email_event('weekly_digest');$c$);
exception when others then raise warning 'pg_cron indisponible: %', sqlerrm;
end $do$;