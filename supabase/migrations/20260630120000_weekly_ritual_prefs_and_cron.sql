-- Rituel hebdo : rendre le « rendez-vous » vivant et CHOISI.
-- Avant cette migration : le handler weekly_digest (email-trigger) existait mais
--   1) n'était déclenché par AUCUN cron → email jamais envoyé,
--   2) ne respectait aucune préférence utilisatrice (envoi à toutes).
-- Idempotente : ré-exécutable sans dommage.

-- 1) Préférences par utilisatrice, lues par email-trigger.handleWeeklyDigest
--    weekly_ritual_day : 1 = lundi … 7 = dimanche (ISO 8601 = extract(isodow)).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_ritual_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS weekly_ritual_day SMALLINT NOT NULL DEFAULT 1;

-- 2) Dédoublonnage : deux migrations ont inséré la séquence « Rendez-vous hebdo ».
--    On garde UNE seule séquence active (la plus ancienne). FK-safe : on désactive,
--    on ne supprime pas (les étapes/templates restent intacts).
UPDATE public.email_sequences
SET is_active = false
WHERE trigger_event = 'weekly_digest'
  AND id <> (
    SELECT id FROM public.email_sequences
    WHERE trigger_event = 'weekly_digest'
    ORDER BY created_at ASC
    LIMIT 1
  );

-- 3) Cron : déclenche weekly_digest TOUS LES JOURS à 8h15 (UTC).
--    Le handler ne sert chaque inscrite que le jour qu'elle a choisi (weekly_ritual_day),
--    avec garde anti-doublon de 6 jours. 8h15 évite le créneau de check-inactive (8h00)
--    et check-credits (8h30). trigger_email_event() existe déjà (migration emails).
do $do$
begin
  begin perform cron.unschedule('email-weekly-digest'); exception when others then null; end;
  perform cron.schedule(
    'email-weekly-digest',
    '15 8 * * *',
    $c$select public.trigger_email_event('weekly_digest');$c$
  );
exception when others then
  raise warning 'pg_cron weekly digest scheduling unavailable: %', sqlerrm;
end $do$;
