
-- ═══════════════════════════════════════════════════════════
-- BULK SECURITY FIX: Change all remaining `public` role policies to `authenticated`
-- This uses ALTER POLICY to change the role without dropping/recreating
-- ═══════════════════════════════════════════════════════════

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles::text LIKE '%public%'
    ORDER BY tablename, policyname
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON public.%I TO authenticated',
      pol.policyname,
      pol.tablename
    );
    RAISE NOTICE 'Fixed: %.%', pol.tablename, pol.policyname;
  END LOOP;
END
$$;
