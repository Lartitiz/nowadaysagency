
-- 1. social_connections : retirer SELECT global puis re-grant colonne par colonne (hors tokens)
DO $$
DECLARE
  cols text;
BEGIN
  REVOKE SELECT ON public.social_connections FROM authenticated, anon;
  REVOKE SELECT (access_token, refresh_token) ON public.social_connections FROM authenticated, anon;

  SELECT string_agg(quote_ident(column_name), ', ')
  INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'social_connections'
    AND column_name NOT IN ('access_token', 'refresh_token');

  EXECUTE format('GRANT SELECT (%s) ON public.social_connections TO authenticated', cols);
END $$;

-- 2. workspaces.plan : retirer UPDATE global puis re-grant hors "plan"
DO $$
DECLARE
  cols text;
BEGIN
  REVOKE UPDATE ON public.workspaces FROM authenticated, anon;
  REVOKE UPDATE (plan) ON public.workspaces FROM authenticated, anon;

  SELECT string_agg(quote_ident(column_name), ', ')
  INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'workspaces'
    AND column_name <> 'plan';

  EXECUTE format('GRANT UPDATE (%s) ON public.workspaces TO authenticated', cols);
END $$;

-- 3. profiles.bonus_credits (+ current_plan, plan_start_date) : retirer UPDATE global puis re-grant hors colonnes billing
DO $$
DECLARE
  cols text;
BEGIN
  REVOKE UPDATE ON public.profiles FROM authenticated, anon;
  REVOKE UPDATE (bonus_credits, current_plan, plan_start_date) ON public.profiles FROM authenticated, anon;

  SELECT string_agg(quote_ident(column_name), ', ')
  INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name NOT IN ('bonus_credits', 'current_plan', 'plan_start_date');

  EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', cols);
END $$;
