CREATE OR REPLACE FUNCTION public.debug_vault_secret_names()
RETURNS TABLE(name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO public, vault
AS $$
  SELECT name::text FROM vault.decrypted_secrets ORDER BY name;
$$;

ALTER FUNCTION public.debug_vault_secret_names() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.debug_vault_secret_names() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debug_vault_secret_names() TO service_role;