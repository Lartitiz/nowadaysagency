
-- Drop legacy single-column unique constraints (idempotent)
ALTER TABLE public.website_homepage DROP CONSTRAINT IF EXISTS website_homepage_user_id_key;
ALTER TABLE public.website_profile  DROP CONSTRAINT IF EXISTS website_profile_user_id_key;

-- Add composite unique (user_id, workspace_id), treating NULL workspace_id as equal
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'website_homepage_user_workspace_key') THEN
    ALTER TABLE public.website_homepage
      ADD CONSTRAINT website_homepage_user_workspace_key UNIQUE NULLS NOT DISTINCT (user_id, workspace_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'website_about_user_workspace_key') THEN
    ALTER TABLE public.website_about
      ADD CONSTRAINT website_about_user_workspace_key UNIQUE NULLS NOT DISTINCT (user_id, workspace_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'website_profile_user_workspace_key') THEN
    ALTER TABLE public.website_profile
      ADD CONSTRAINT website_profile_user_workspace_key UNIQUE NULLS NOT DISTINCT (user_id, workspace_id);
  END IF;
END $$;

-- Extend RLS policies on the 3 tables to allow workspace member access
-- website_homepage
DROP POLICY IF EXISTS "Users can view own homepage" ON public.website_homepage;
DROP POLICY IF EXISTS "Users can insert own homepage" ON public.website_homepage;
DROP POLICY IF EXISTS "Users can update own homepage" ON public.website_homepage;
DROP POLICY IF EXISTS "Users can delete own homepage" ON public.website_homepage;

CREATE POLICY "Users can view own homepage" ON public.website_homepage FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
CREATE POLICY "Users can insert own homepage" ON public.website_homepage FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
CREATE POLICY "Users can update own homepage" ON public.website_homepage FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id))
  WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
CREATE POLICY "Users can delete own homepage" ON public.website_homepage FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));

-- website_about
DROP POLICY IF EXISTS "Users can view own about" ON public.website_about;
DROP POLICY IF EXISTS "Users can insert own about" ON public.website_about;
DROP POLICY IF EXISTS "Users can update own about" ON public.website_about;
DROP POLICY IF EXISTS "Users can delete own about" ON public.website_about;

CREATE POLICY "Users can view own about" ON public.website_about FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
CREATE POLICY "Users can insert own about" ON public.website_about FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
CREATE POLICY "Users can update own about" ON public.website_about FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id))
  WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
CREATE POLICY "Users can delete own about" ON public.website_about FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));

-- website_profile
DROP POLICY IF EXISTS "Users can view own website profile" ON public.website_profile;
DROP POLICY IF EXISTS "Users can insert own website profile" ON public.website_profile;
DROP POLICY IF EXISTS "Users can update own website profile" ON public.website_profile;
DROP POLICY IF EXISTS "Users can delete own website profile" ON public.website_profile;

CREATE POLICY "Users can view own website profile" ON public.website_profile FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
CREATE POLICY "Users can insert own website profile" ON public.website_profile FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
CREATE POLICY "Users can update own website profile" ON public.website_profile FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id))
  WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
CREATE POLICY "Users can delete own website profile" ON public.website_profile FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
