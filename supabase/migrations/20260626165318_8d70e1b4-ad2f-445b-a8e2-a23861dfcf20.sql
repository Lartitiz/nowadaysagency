CREATE OR REPLACE FUNCTION public.debug_service_role_sources()
RETURNS TABLE(source_name text, is_present boolean, value_length int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, vault
AS $$
DECLARE
  v text;
BEGIN
  SELECT decrypted_secret INTO v
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_service_role_key'
  LIMIT 1;
  source_name := 'vault.supabase_service_role_key'; is_present := v IS NOT NULL; value_length := coalesce(char_length(v), 0); RETURN NEXT;

  v := current_setting('supabase.service_role_key', true);
  source_name := 'current_setting.supabase.service_role_key'; is_present := nullif(v, '') IS NOT NULL; value_length := coalesce(char_length(nullif(v, '')), 0); RETURN NEXT;

  v := current_setting('SUPABASE_SERVICE_ROLE_KEY', true);
  source_name := 'current_setting.SUPABASE_SERVICE_ROLE_KEY'; is_present := nullif(v, '') IS NOT NULL; value_length := coalesce(char_length(nullif(v, '')), 0); RETURN NEXT;
END;
$$;

ALTER FUNCTION public.debug_service_role_sources() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.debug_service_role_sources() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debug_service_role_sources() TO PUBLIC;