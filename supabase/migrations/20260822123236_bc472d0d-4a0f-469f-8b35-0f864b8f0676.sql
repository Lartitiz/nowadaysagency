CREATE OR REPLACE FUNCTION public.on_profile_created_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'vault'
AS $function$
DECLARE
  _supabase_url text;
  _service_role_key text;
BEGIN
  SELECT decrypted_secret INTO _service_role_key
  FROM vault.decrypted_secrets
  WHERE name IN ('supabase_service_role_key', 'SUPABASE_SERVICE_ROLE_KEY')
  ORDER BY CASE WHEN name = 'supabase_service_role_key' THEN 0 ELSE 1 END
  LIMIT 1;

  IF _service_role_key IS NULL THEN
    RAISE WARNING 'Cannot get service_role_key for email trigger';
    RETURN NEW;
  END IF;

  _supabase_url := COALESCE(
    current_setting('supabase.url', true),
    'https://fhdyflgojppwgrscmtdp.supabase.co'
  );

  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/email-trigger',
    body := jsonb_build_object('event', 'signup', 'user_id', NEW.user_id::text),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    ),
    timeout_milliseconds := 30000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Email trigger failed for user %: %', NEW.user_id, SQLERRM;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_email_event(_event text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'vault'
AS $function$
DECLARE
  _service_role_key text;
  _supabase_url text;
BEGIN
  SELECT decrypted_secret INTO _service_role_key
  FROM vault.decrypted_secrets
  WHERE name IN ('supabase_service_role_key', 'SUPABASE_SERVICE_ROLE_KEY')
  ORDER BY CASE WHEN name = 'supabase_service_role_key' THEN 0 ELSE 1 END
  LIMIT 1;

  IF _service_role_key IS NULL THEN
    RAISE WARNING 'Cannot get service_role_key for email cron';
    RETURN;
  END IF;

  _supabase_url := COALESCE(current_setting('supabase.url', true), 'https://fhdyflgojppwgrscmtdp.supabase.co');

  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/email-trigger',
    body := jsonb_build_object('event', _event),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    ),
    timeout_milliseconds := 30000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_email_event(%) failed: %', _event, SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_stats_monthly_snapshot()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'vault'
AS $function$
DECLARE
  _service_role_key text;
  _supabase_url text;
BEGIN
  SELECT decrypted_secret INTO _service_role_key
  FROM vault.decrypted_secrets
  WHERE name IN ('supabase_service_role_key', 'SUPABASE_SERVICE_ROLE_KEY')
  ORDER BY CASE WHEN name = 'supabase_service_role_key' THEN 0 ELSE 1 END
  LIMIT 1;

  IF _service_role_key IS NULL THEN
    RAISE WARNING 'Cannot get service_role_key for stats snapshot cron';
    RETURN;
  END IF;

  _supabase_url := COALESCE(current_setting('supabase.url', true), 'https://fhdyflgojppwgrscmtdp.supabase.co');

  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/stats-monthly-snapshot',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    ),
    timeout_milliseconds := 30000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_stats_monthly_snapshot failed: %', SQLERRM;
END;
$function$;