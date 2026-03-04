
-- ═══════════════════════════════════════════════════════════
-- SECURITY FIX: Restrict all RLS policies from `public` to `authenticated` role
-- This prevents anonymous (unauthenticated) access to user data
-- ═══════════════════════════════════════════════════════════

-- ── profiles ──
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
-- Admin can view all profiles
CREATE POLICY "Admin can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ── contacts ──
DROP POLICY IF EXISTS "Users can manage own contacts" ON public.contacts;

CREATE POLICY "Users can manage own contacts" ON public.contacts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "workspace_contacts" ON public.contacts FOR ALL TO authenticated USING (user_has_workspace_access(workspace_id)) WITH CHECK (user_has_workspace_access(workspace_id));

-- ── prospects ──
DROP POLICY IF EXISTS "Users can view own prospects" ON public.prospects;
DROP POLICY IF EXISTS "Users can insert own prospects" ON public.prospects;
DROP POLICY IF EXISTS "Users can update own prospects" ON public.prospects;
DROP POLICY IF EXISTS "Users can delete own prospects" ON public.prospects;

CREATE POLICY "Users can view own prospects" ON public.prospects FOR SELECT TO authenticated USING (auth.uid() = user_id OR user_has_workspace_access(workspace_id));
CREATE POLICY "Users can insert own prospects" ON public.prospects FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR user_has_workspace_access(workspace_id));
CREATE POLICY "Users can update own prospects" ON public.prospects FOR UPDATE TO authenticated USING (auth.uid() = user_id OR user_has_workspace_access(workspace_id));
CREATE POLICY "Users can delete own prospects" ON public.prospects FOR DELETE TO authenticated USING (auth.uid() = user_id OR user_has_workspace_access(workspace_id));

-- ── subscriptions ──
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;

CREATE POLICY "Users can view own subscription" ON public.subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ── purchases ──
DROP POLICY IF EXISTS "Users can view own purchases" ON public.purchases;

CREATE POLICY "Users can view own purchases" ON public.purchases FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ── coaching_programs ──
DROP POLICY IF EXISTS "client_own_program" ON public.coaching_programs;
DROP POLICY IF EXISTS "coach_all_programs" ON public.coaching_programs;

CREATE POLICY "client_own_program" ON public.coaching_programs FOR SELECT TO authenticated USING (auth.uid() = client_user_id);
CREATE POLICY "coach_all_programs" ON public.coaching_programs FOR ALL TO authenticated USING (auth.uid() = coach_user_id OR public.has_role(auth.uid(), 'admin'));

-- ── coaching_sessions ──
DROP POLICY IF EXISTS "client_own_sessions" ON public.coaching_sessions;
DROP POLICY IF EXISTS "coach_all_sessions" ON public.coaching_sessions;

CREATE POLICY "client_own_sessions" ON public.coaching_sessions FOR SELECT TO authenticated USING (program_id IN (SELECT id FROM coaching_programs WHERE client_user_id = auth.uid()));
CREATE POLICY "coach_all_sessions" ON public.coaching_sessions FOR ALL TO authenticated USING (program_id IN (SELECT id FROM coaching_programs WHERE coach_user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- ── intake_questionnaires ──
DROP POLICY IF EXISTS "Users can view their own intake" ON public.intake_questionnaires;
DROP POLICY IF EXISTS "Users can insert their own intake" ON public.intake_questionnaires;
DROP POLICY IF EXISTS "Users can update their own intake" ON public.intake_questionnaires;
DROP POLICY IF EXISTS "Admin can view all intakes" ON public.intake_questionnaires;

CREATE POLICY "Users can view their own intake" ON public.intake_questionnaires FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own intake" ON public.intake_questionnaires FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own intake" ON public.intake_questionnaires FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admin can view all intakes" ON public.intake_questionnaires FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM coaching_programs cp WHERE cp.id = intake_questionnaires.program_id AND cp.coach_user_id = auth.uid()));

-- ── user_documents ──
DROP POLICY IF EXISTS "Users can view own documents" ON public.user_documents;
DROP POLICY IF EXISTS "Users can insert own documents" ON public.user_documents;
DROP POLICY IF EXISTS "Users can update own documents" ON public.user_documents;
DROP POLICY IF EXISTS "Users can delete own documents" ON public.user_documents;

CREATE POLICY "Users can view own documents" ON public.user_documents FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own documents" ON public.user_documents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own documents" ON public.user_documents FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own documents" ON public.user_documents FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ── monthly_stats ──
DROP POLICY IF EXISTS "Users can view own monthly stats" ON public.monthly_stats;
DROP POLICY IF EXISTS "Users can insert own monthly stats" ON public.monthly_stats;
DROP POLICY IF EXISTS "Users can update own monthly stats" ON public.monthly_stats;
DROP POLICY IF EXISTS "Users can delete own monthly stats" ON public.monthly_stats;

CREATE POLICY "Users can view own monthly stats" ON public.monthly_stats FOR SELECT TO authenticated USING (auth.uid() = user_id OR user_has_workspace_access(workspace_id));
CREATE POLICY "Users can insert own monthly stats" ON public.monthly_stats FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR user_has_workspace_access(workspace_id));
CREATE POLICY "Users can update own monthly stats" ON public.monthly_stats FOR UPDATE TO authenticated USING (auth.uid() = user_id OR user_has_workspace_access(workspace_id));
CREATE POLICY "Users can delete own monthly stats" ON public.monthly_stats FOR DELETE TO authenticated USING (auth.uid() = user_id OR user_has_workspace_access(workspace_id));

-- ── offers ──
DROP POLICY IF EXISTS "Users can view own offers" ON public.offers;
DROP POLICY IF EXISTS "Users can insert own offers" ON public.offers;
DROP POLICY IF EXISTS "Users can update own offers" ON public.offers;
DROP POLICY IF EXISTS "Users can delete own offers" ON public.offers;
DROP POLICY IF EXISTS "workspace_select_offers" ON public.offers;
DROP POLICY IF EXISTS "workspace_insert_offers" ON public.offers;
DROP POLICY IF EXISTS "workspace_update_offers" ON public.offers;
DROP POLICY IF EXISTS "workspace_delete_offers" ON public.offers;

CREATE POLICY "Users can view own offers" ON public.offers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own offers" ON public.offers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own offers" ON public.offers FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own offers" ON public.offers FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "workspace_select_offers" ON public.offers FOR SELECT TO authenticated USING (user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_insert_offers" ON public.offers FOR INSERT TO authenticated WITH CHECK (user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_update_offers" ON public.offers FOR UPDATE TO authenticated USING (user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_delete_offers" ON public.offers FOR DELETE TO authenticated USING (user_has_workspace_access(workspace_id));

-- ── brand_profile ──
DROP POLICY IF EXISTS "Users can view own brand profile" ON public.brand_profile;
DROP POLICY IF EXISTS "Users can insert own brand profile" ON public.brand_profile;
DROP POLICY IF EXISTS "Users can update own brand profile" ON public.brand_profile;
DROP POLICY IF EXISTS "workspace_select_brand_profile" ON public.brand_profile;
DROP POLICY IF EXISTS "workspace_insert_brand_profile" ON public.brand_profile;
DROP POLICY IF EXISTS "workspace_update_brand_profile" ON public.brand_profile;
DROP POLICY IF EXISTS "workspace_delete_brand_profile" ON public.brand_profile;

CREATE POLICY "Users can view own brand profile" ON public.brand_profile FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own brand profile" ON public.brand_profile FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own brand profile" ON public.brand_profile FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "workspace_select_brand_profile" ON public.brand_profile FOR SELECT TO authenticated USING (user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_insert_brand_profile" ON public.brand_profile FOR INSERT TO authenticated WITH CHECK (user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_update_brand_profile" ON public.brand_profile FOR UPDATE TO authenticated USING (user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_delete_brand_profile" ON public.brand_profile FOR DELETE TO authenticated USING (user_has_workspace_access(workspace_id));

-- ── workspaces ──
DROP POLICY IF EXISTS "Creator can view own workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Members can view their workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Authenticated users can create workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Owners and managers can update workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Creator and managers can delete workspaces" ON public.workspaces;

CREATE POLICY "Creator can view own workspaces" ON public.workspaces FOR SELECT TO authenticated USING (created_by = auth.uid());
CREATE POLICY "Members can view their workspaces" ON public.workspaces FOR SELECT TO authenticated USING (user_has_workspace_access(id));
CREATE POLICY "Authenticated users can create workspaces" ON public.workspaces FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Owners and managers can update workspaces" ON public.workspaces FOR UPDATE TO authenticated USING (user_workspace_role(id) IN ('owner', 'manager'));
CREATE POLICY "Creator and managers can delete workspaces" ON public.workspaces FOR DELETE TO authenticated USING (created_by = auth.uid() OR user_workspace_role(id) IN ('owner', 'manager'));

-- ── workspace_members ──
DROP POLICY IF EXISTS "Members can view workspace members" ON public.workspace_members;
DROP POLICY IF EXISTS "Creator can bootstrap workspace members" ON public.workspace_members;
DROP POLICY IF EXISTS "Owners and managers can add members" ON public.workspace_members;
DROP POLICY IF EXISTS "Owners and managers can remove members" ON public.workspace_members;

CREATE POLICY "Members can view workspace members" ON public.workspace_members FOR SELECT TO authenticated USING (user_has_workspace_access(workspace_id));
CREATE POLICY "Creator can bootstrap workspace members" ON public.workspace_members FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_members.workspace_id AND workspaces.created_by = auth.uid()));
CREATE POLICY "Owners and managers can add members" ON public.workspace_members FOR INSERT TO authenticated WITH CHECK (user_workspace_role(workspace_id) IN ('owner', 'manager'));
CREATE POLICY "Owners and managers can remove members" ON public.workspace_members FOR DELETE TO authenticated USING (user_workspace_role(workspace_id) IN ('owner', 'manager'));

-- ── scrape_cache ──
DROP POLICY IF EXISTS "Users can read own cache" ON public.scrape_cache;
DROP POLICY IF EXISTS "Users can insert own cache" ON public.scrape_cache;

CREATE POLICY "Users can read own cache" ON public.scrape_cache FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own cache" ON public.scrape_cache FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ── webhook_events (currently no policies) ──
-- This table should only be accessible by service role (edge functions), not by users
-- No policies needed = table is inaccessible to all roles (which is correct for webhook data)

-- ── beta_feedback (already uses authenticated, but add SELECT for own feedback) ──
CREATE POLICY "Users can view own feedback" ON public.beta_feedback FOR SELECT TO authenticated USING (auth.uid() = user_id);
