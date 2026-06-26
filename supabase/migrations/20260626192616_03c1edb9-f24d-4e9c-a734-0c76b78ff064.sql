CREATE OR REPLACE FUNCTION public.vault_upsert_service_role_key(p_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  _id uuid;
BEGIN
  SELECT id INTO _id FROM vault.secrets WHERE name = 'supabase_service_role_key' LIMIT 1;
  IF _id IS NULL THEN
    PERFORM vault.create_secret(p_value, 'supabase_service_role_key', 'service role key for cron-triggered edge calls');
  ELSE
    PERFORM vault.update_secret(_id, p_value);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.vault_upsert_service_role_key(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_upsert_service_role_key(text) TO service_role;