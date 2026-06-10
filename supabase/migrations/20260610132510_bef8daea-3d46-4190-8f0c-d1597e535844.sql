DROP POLICY IF EXISTS "Anyone can read active promo codes" ON public.promo_codes;

DROP POLICY IF EXISTS workspace_select_user_photos ON public.user_photos;
DROP POLICY IF EXISTS workspace_insert_user_photos ON public.user_photos;
DROP POLICY IF EXISTS workspace_update_user_photos ON public.user_photos;
DROP POLICY IF EXISTS workspace_delete_user_photos ON public.user_photos;

CREATE POLICY workspace_select_user_photos ON public.user_photos
  FOR SELECT TO authenticated
  USING (user_has_workspace_access(user_id));

CREATE POLICY workspace_insert_user_photos ON public.user_photos
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY workspace_update_user_photos ON public.user_photos
  FOR UPDATE TO authenticated
  USING (user_has_workspace_access(user_id))
  WITH CHECK (user_has_workspace_access(user_id));

CREATE POLICY workspace_delete_user_photos ON public.user_photos
  FOR DELETE TO authenticated
  USING (user_has_workspace_access(user_id));