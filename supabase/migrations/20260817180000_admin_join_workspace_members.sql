-- Bug « Ouvrir son espace » (admin coaching, 17/08) : un·e admin qui ouvre l'espace
-- d'une cliente dont le workspace a été auto-créé (signup libre, pas kick-off admin)
-- n'est ni created_by ni déjà owner/manager de ce workspace → les policies INSERT
-- existantes ("Creator can bootstrap workspace members", "Owners and managers can
-- add members") bloquent silencieusement son ajout à workspace_members, et le
-- switch d'espace échoue en silence (cf CoachingProgramList.tsx handleOpenWorkspace).
CREATE POLICY "Admin can add workspace members" ON public.workspace_members
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
