-- No rows, tokens, expirations or historical workspace assignments are changed.
DROP POLICY IF EXISTS "Users manage own links" ON public.shared_branding_links;
CREATE POLICY branding_links_read ON public.shared_branding_links FOR SELECT TO authenticated
USING ((workspace_id IS NULL AND user_id = auth.uid()) OR public.user_has_workspace_access(workspace_id));
CREATE POLICY branding_links_write ON public.shared_branding_links FOR ALL TO authenticated
USING (
  (workspace_id IS NULL AND user_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = shared_branding_links.workspace_id
    AND m.user_id = auth.uid() AND m.role IN ('owner', 'manager', 'editor'))
)
WITH CHECK (
  (workspace_id IS NULL AND user_id = auth.uid()) OR (
    EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = shared_branding_links.workspace_id
      AND m.user_id = auth.uid() AND m.role IN ('owner', 'manager', 'editor'))
    AND (is_active = false OR EXISTS (SELECT 1 FROM public.workspace_members o WHERE o.workspace_id = shared_branding_links.workspace_id
      AND o.user_id = shared_branding_links.user_id AND o.role = 'owner'))
  )
);
-- Even an additional permissive policy must not restore writes for a viewer.
CREATE POLICY branding_links_insert_guard ON public.shared_branding_links AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK ((workspace_id IS NULL AND user_id = auth.uid()) OR (
  EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = shared_branding_links.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','manager','editor'))
  AND EXISTS (SELECT 1 FROM public.workspace_members o WHERE o.workspace_id = shared_branding_links.workspace_id AND o.user_id = shared_branding_links.user_id AND o.role = 'owner')));
CREATE POLICY branding_links_update_guard ON public.shared_branding_links AS RESTRICTIVE FOR UPDATE TO authenticated
USING ((workspace_id IS NULL AND user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = shared_branding_links.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','manager','editor')))
WITH CHECK ((workspace_id IS NULL AND user_id = auth.uid()) OR (
  EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = shared_branding_links.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','manager','editor'))
  AND (is_active = false OR EXISTS (SELECT 1 FROM public.workspace_members o WHERE o.workspace_id = shared_branding_links.workspace_id AND o.user_id = shared_branding_links.user_id AND o.role = 'owner'))));
CREATE POLICY branding_links_delete_guard ON public.shared_branding_links AS RESTRICTIVE FOR DELETE TO authenticated
USING ((workspace_id IS NULL AND user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = shared_branding_links.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','manager','editor')));