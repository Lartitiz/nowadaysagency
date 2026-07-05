DROP POLICY "Members can view workspace invitations" ON public.workspace_invitations;
CREATE POLICY "Members can view workspace invitations"
  ON public.workspace_invitations FOR SELECT TO authenticated
  USING (public.user_has_workspace_access(workspace_id) OR lower(email) = lower(auth.email()));

DROP POLICY "Invitee can accept invitation" ON public.workspace_invitations;
CREATE POLICY "Invitee can accept invitation"
  ON public.workspace_invitations FOR UPDATE TO authenticated
  USING (lower(email) = lower(auth.email()));

CREATE POLICY "Invitee can join via valid invitation"
  ON public.workspace_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.workspace_invitations wi
      WHERE wi.workspace_id = workspace_members.workspace_id
        AND lower(wi.email) = lower(auth.email())
        AND wi.accepted_at IS NULL
        AND wi.expires_at > now()
        AND wi.role = workspace_members.role
    )
  );