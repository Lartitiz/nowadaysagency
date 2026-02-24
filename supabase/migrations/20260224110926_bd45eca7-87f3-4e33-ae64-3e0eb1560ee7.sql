
-- =============================================
-- FIX 1: Make audit-posts bucket private
-- =============================================
UPDATE storage.buckets SET public = false WHERE id = 'audit-posts';

-- Update SELECT policy to owner-only (was open to all authenticated)
DROP POLICY IF EXISTS "Users can view audit posts" ON storage.objects;
CREATE POLICY "Users can view own audit posts" ON storage.objects FOR SELECT
  USING (bucket_id = 'audit-posts' AND auth.uid()::text = (storage.foldername(name))[1]);

-- =============================================
-- FIX 2: Studio-only posts require studio subscription
-- =============================================
DROP POLICY IF EXISTS "Studio members can read studio posts" ON public.community_posts;
CREATE POLICY "Studio members can read studio posts"
  ON public.community_posts FOR SELECT TO authenticated
  USING (
    is_studio_only = true
    AND EXISTS (
      SELECT 1 FROM subscriptions
      WHERE subscriptions.user_id = auth.uid()
      AND subscriptions.plan = 'studio'
      AND subscriptions.status = 'active'
    )
  );

-- =============================================
-- FIX 3: Replace hardcoded email with role-based auth
-- =============================================

-- Create role enum and user_roles table
CREATE TYPE public.app_role AS ENUM ('coach', 'admin');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Only the role holder can see their own role (no public access)
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Assign coach role to Laetitia
INSERT INTO public.user_roles (user_id, role)
VALUES ('ec5e783c-e89d-44f0-aff2-bca434869740', 'coach');

-- Replace coaching_programs policy
DROP POLICY IF EXISTS "coach_all_programs" ON public.coaching_programs;
CREATE POLICY "coach_all_programs" ON public.coaching_programs
  FOR ALL USING (
    auth.uid() = coach_user_id
    OR public.has_role(auth.uid(), 'coach')
  );

-- Replace coaching_sessions policy
DROP POLICY IF EXISTS "coach_all_sessions" ON public.coaching_sessions;
CREATE POLICY "coach_all_sessions" ON public.coaching_sessions
  FOR ALL USING (
    program_id IN (
      SELECT id FROM coaching_programs WHERE coach_user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'coach')
  );

-- Replace coaching_actions policy
DROP POLICY IF EXISTS "coach_all_actions" ON public.coaching_actions;
CREATE POLICY "coach_all_actions" ON public.coaching_actions
  FOR ALL USING (
    program_id IN (
      SELECT id FROM coaching_programs WHERE coach_user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'coach')
  );

-- Replace coaching_deliverables policy
DROP POLICY IF EXISTS "coach_all_deliverables" ON public.coaching_deliverables;
CREATE POLICY "coach_all_deliverables" ON public.coaching_deliverables
  FOR ALL USING (
    program_id IN (
      SELECT id FROM coaching_programs WHERE coach_user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'coach')
  );
