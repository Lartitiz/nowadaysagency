REVOKE UPDATE (plan) ON public.workspaces FROM authenticated, anon;

REVOKE UPDATE (bonus_credits) ON public.profiles FROM authenticated, anon;

UPDATE public.profiles SET bonus_credits = 0 WHERE bonus_credits < 0;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_bonus_credits_nonneg;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_bonus_credits_nonneg CHECK (bonus_credits >= 0);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP FUNCTION IF EXISTS public.debug_vault_secret_names();
DROP FUNCTION IF EXISTS public.debug_service_role_sources();