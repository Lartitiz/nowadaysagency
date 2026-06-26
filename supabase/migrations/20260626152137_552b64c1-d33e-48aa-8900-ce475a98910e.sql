
CREATE OR REPLACE FUNCTION public.trigger_publish_due_posts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _service_role_key text;
  _supabase_url text := 'https://fhdyflgojppwgrscmtdp.supabase.co';
BEGIN
  SELECT decrypted_secret INTO _service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_service_role_key'
  LIMIT 1;

  IF _service_role_key IS NULL THEN
    RAISE WARNING 'service_role_key missing in vault';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/social-publish-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    ),
    body := jsonb_build_object('triggered_at', now()),
    timeout_milliseconds := 60000
  );
END;
$$;
