-- Enable pg_net for async HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function: trigger email sequence on profile creation
CREATE OR REPLACE FUNCTION public.on_profile_created_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _supabase_url text;
  _service_role_key text;
BEGIN
  -- Récupère le service_role_key depuis le vault
  SELECT decrypted_secret INTO _service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_service_role_key'
  LIMIT 1;

  -- Fallback : essaye via current_setting
  IF _service_role_key IS NULL THEN
    BEGIN
      _service_role_key := current_setting('supabase.service_role_key', true);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Cannot get service_role_key for email trigger';
      RETURN NEW;
    END;
  END IF;

  _supabase_url := COALESCE(
    current_setting('supabase.url', true),
    'https://fhdyflgojppwgrscmtdp.supabase.co'
  );

  -- Appel async à la Edge Function email-trigger
  PERFORM extensions.http_post(
    url := _supabase_url || '/functions/v1/email-trigger',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    ),
    body := jsonb_build_object('event', 'signup', 'user_id', NEW.user_id::text)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Ne jamais bloquer l'inscription si l'email échoue
  RAISE WARNING 'Email trigger failed for user %: %', NEW.user_id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Trigger on profile insert
DROP TRIGGER IF EXISTS trigger_profile_created_email ON public.profiles;
CREATE TRIGGER trigger_profile_created_email
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.on_profile_created_email();