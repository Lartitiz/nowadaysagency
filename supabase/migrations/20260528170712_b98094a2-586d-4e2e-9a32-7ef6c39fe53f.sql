
-- 1. Fix coach_manages_deliverable_files: use has_role instead of hardcoded email
DROP POLICY IF EXISTS "coach_manages_deliverable_files" ON storage.objects;
CREATE POLICY "admin_manages_deliverable_files"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'deliverables' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'deliverables' AND public.has_role(auth.uid(), 'admin'));

-- 2. Restrict landing-assets writes to admins only
DROP POLICY IF EXISTS "Authenticated users can upload landing assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update landing assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete landing assets" ON storage.objects;

CREATE POLICY "Admins can upload landing assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'landing-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update landing assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'landing-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete landing assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'landing-assets' AND public.has_role(auth.uid(), 'admin'));

-- 3. Scope series table policies to authenticated role explicitly
DROP POLICY IF EXISTS "workspace_select_series" ON public.series;
DROP POLICY IF EXISTS "workspace_insert_series" ON public.series;
DROP POLICY IF EXISTS "workspace_update_series" ON public.series;
DROP POLICY IF EXISTS "workspace_delete_series" ON public.series;

CREATE POLICY "workspace_select_series" ON public.series
FOR SELECT TO authenticated
USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY "workspace_insert_series" ON public.series
FOR INSERT TO authenticated
WITH CHECK (public.user_has_workspace_access(workspace_id));

CREATE POLICY "workspace_update_series" ON public.series
FOR UPDATE TO authenticated
USING (public.user_has_workspace_access(workspace_id))
WITH CHECK (public.user_has_workspace_access(workspace_id));

CREATE POLICY "workspace_delete_series" ON public.series
FOR DELETE TO authenticated
USING (public.user_has_workspace_access(workspace_id));
