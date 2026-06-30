-- #1 workspaces.plan
REVOKE UPDATE (plan) ON public.workspaces FROM authenticated, anon;
DROP POLICY IF EXISTS "Owners and managers can update workspaces" ON public.workspaces;
CREATE POLICY "Owners and managers can update workspaces" ON public.workspaces
  FOR UPDATE TO authenticated
  USING      (public.user_workspace_role(id) IN ('owner','manager'))
  WITH CHECK (public.user_workspace_role(id) IN ('owner','manager'));

-- #2 profiles
REVOKE UPDATE (bonus_credits, current_plan) ON public.profiles FROM authenticated, anon;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_bonus_credits_non_negative;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_bonus_credits_non_negative CHECK (bonus_credits >= 0) NOT VALID;
ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_bonus_credits_non_negative;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- F-5 debug
DROP FUNCTION IF EXISTS public.debug_vault_secret_names();
DROP FUNCTION IF EXISTS public.debug_service_role_sources();

-- #5 anti-transplant
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'generated_posts','generated_carousels','calendar_posts','content_drafts',
    'saved_ideas','persona','storytelling','instagram_editorial_line',
    'brand_proposition','brand_strategy','brand_profile','brand_charter',
    'offers','contacts','calendar_shares','voice_profile'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_immovable ON public.%I;', t);
    EXECUTE format(
      'CREATE POLICY tenant_immovable ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'WITH CHECK (workspace_id IS NULL OR public.user_has_workspace_access(workspace_id));', t);
  END LOOP;
END $$;