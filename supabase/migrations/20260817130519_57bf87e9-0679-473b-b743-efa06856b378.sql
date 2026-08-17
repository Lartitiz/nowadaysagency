CREATE POLICY "Admin can add workspace members" ON public.workspace_members
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));