CREATE OR REPLACE FUNCTION public.trigger_publish_due_posts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, vault, net
AS $$
DECLARE
  _service_role_key text;
  _supabase_url text := 'https://fhdyflgojppwgrscmtdp.supabase.co';
BEGIN
  SELECT decrypted_secret INTO _service_role_key
  FROM vault.decrypted_secrets
  WHERE name IN ('supabase_service_role_key', 'SUPABASE_SERVICE_ROLE_KEY')
  ORDER BY CASE WHEN name = 'supabase_service_role_key' THEN 0 ELSE 1 END
  LIMIT 1;

  IF _service_role_key IS NULL OR length(_service_role_key) < 20 THEN
    RAISE WARNING 'service_role_key missing in vault';
    RETURN;
  END IF;

  PERFORM net.http_post(
    _supabase_url || '/functions/v1/social-publish-scheduled',
    jsonb_build_object('triggered_at', now()),
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role_key,
      'apikey', _service_role_key
    ),
    60000
  );
END;
$$;

ALTER FUNCTION public.trigger_publish_due_posts() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trigger_publish_due_posts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trigger_publish_due_posts() TO postgres;
GRANT EXECUTE ON FUNCTION public.trigger_publish_due_posts() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'publish-due-instagram') THEN
    PERFORM cron.unschedule('publish-due-instagram');
  END IF;

  PERFORM cron.schedule(
    'publish-due-instagram',
    '*/5 * * * *',
    'SELECT public.trigger_publish_due_posts();'
  );
END $$;