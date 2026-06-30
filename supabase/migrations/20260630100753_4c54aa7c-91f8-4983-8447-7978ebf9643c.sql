
-- social_connections : SELECT global retiré, re-grant colonnes non-sensibles
REVOKE SELECT ON public.social_connections FROM authenticated, anon;
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ') INTO cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='social_connections'
    AND column_name NOT IN ('access_token','refresh_token');
  EXECUTE 'GRANT SELECT (' || cols || ') ON public.social_connections TO authenticated';
END $$;

-- workspaces : UPDATE global retiré, re-grant sans 'plan'
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ') INTO cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='workspaces'
    AND column_name NOT IN ('plan','id','created_at','created_by');
  EXECUTE 'REVOKE UPDATE ON public.workspaces FROM authenticated, anon';
  EXECUTE 'GRANT UPDATE (' || cols || ') ON public.workspaces TO authenticated';
END $$;

-- profiles : UPDATE global retiré, re-grant sans colonnes facturation
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ') INTO cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='profiles'
    AND column_name NOT IN ('bonus_credits','current_plan','plan_start_date','user_id','id','created_at');
  EXECUTE 'REVOKE UPDATE ON public.profiles FROM authenticated, anon';
  EXECUTE 'GRANT UPDATE (' || cols || ') ON public.profiles TO authenticated';
END $$;
