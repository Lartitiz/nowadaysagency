-- Correctifs RLS issus de l'audit d'isolation inter-workspace (25/06/2026)
--
-- 1. coaching_actions / coaching_deliverables : fermeture d'une fuite cross-tenant latente.
--    Leurs policies gardaient `OR has_role('coach')` (bypass global, héritage 20260224110926),
--    alors que coaching_programs / coaching_sessions ont été durcis en `has_role('admin')`
--    par 20260304090335. Conséquence : tout détenteur du rôle global `coach` verrait les
--    actions/livrables de TOUS les workspaces. On les aligne sur le pattern programs/sessions
--    (accès via le coach du programme OU admin) → mêmes règles, plus de bypass global.
--
-- 2. user_photos : réparation d'une régression introduite par 20260610132510, qui a recréé
--    les policies avec `user_has_workspace_access(user_id)` au lieu de
--    `user_has_workspace_access(workspace_id)` (l'original correct était 20260424105337).
--    Le helper attend un workspace_id → l'argument user_id ne matche jamais → SELECT/UPDATE/
--    DELETE systématiquement refusés (les clientes ne voyaient plus leurs photos retouchées).
--    Ce n'est pas une fuite (plus restrictif) mais une fonctionnalité cassée. INSERT était
--    déjà correct (auth.uid() = user_id) → on n'y touche pas.

-- ── 1. coaching_actions ──
DROP POLICY IF EXISTS "coach_all_actions" ON public.coaching_actions;
CREATE POLICY "coach_all_actions" ON public.coaching_actions
  FOR ALL TO authenticated USING (
    program_id IN (
      SELECT id FROM public.coaching_programs WHERE coach_user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

-- ── 1. coaching_deliverables ──
DROP POLICY IF EXISTS "coach_all_deliverables" ON public.coaching_deliverables;
CREATE POLICY "coach_all_deliverables" ON public.coaching_deliverables
  FOR ALL TO authenticated USING (
    program_id IN (
      SELECT id FROM public.coaching_programs WHERE coach_user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

-- ── 2. user_photos : restaurer le bon argument (workspace_id) ──
DROP POLICY IF EXISTS workspace_select_user_photos ON public.user_photos;
DROP POLICY IF EXISTS workspace_update_user_photos ON public.user_photos;
DROP POLICY IF EXISTS workspace_delete_user_photos ON public.user_photos;

CREATE POLICY workspace_select_user_photos ON public.user_photos
  FOR SELECT USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY workspace_update_user_photos ON public.user_photos
  FOR UPDATE USING (public.user_has_workspace_access(workspace_id))
  WITH CHECK (public.user_has_workspace_access(workspace_id));

CREATE POLICY workspace_delete_user_photos ON public.user_photos
  FOR DELETE USING (public.user_has_workspace_access(workspace_id));
