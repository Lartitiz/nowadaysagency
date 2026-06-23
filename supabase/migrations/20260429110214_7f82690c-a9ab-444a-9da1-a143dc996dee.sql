
-- 1. user_roles: lock down writes to admins only
CREATE POLICY "Only admins can insert roles"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update roles"
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can delete roles"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Revoke EXECUTE from anon/authenticated on SECURITY DEFINER helpers
--    that are not meant to be called via PostgREST. They keep working
--    inside triggers and via the service role.
REVOKE EXECUTE ON FUNCTION public.copy_email_from_auth() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_profile_created_email() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reward_referral_on_accept() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_plan_on_program_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_bonus_credits(uuid, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_promo_uses(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_owner_workspace(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_has_workspace_access(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_workspace_role(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_summary(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_plan_data(text, uuid) FROM anon;
