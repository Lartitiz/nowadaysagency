
-- Table for storing demo profiles (admin-only feature)
CREATE TABLE public.demo_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  demo_name TEXT NOT NULL,
  demo_activity TEXT NOT NULL,
  demo_instagram TEXT,
  demo_website TEXT,
  demo_problem TEXT,
  generated_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.demo_profiles ENABLE ROW LEVEL SECURITY;

-- Only allow access for the specific admin email
CREATE POLICY "admin_only_demos" ON public.demo_profiles
  FOR ALL USING (
    auth.uid() = admin_user_id
    AND (auth.jwt() ->> 'email') = 'laetitia@nowadaysagency.com'
  )
  WITH CHECK (
    auth.uid() = admin_user_id
    AND (auth.jwt() ->> 'email') = 'laetitia@nowadaysagency.com'
  );
