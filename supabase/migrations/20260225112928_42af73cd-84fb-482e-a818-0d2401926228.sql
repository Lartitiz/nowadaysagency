
CREATE TABLE IF NOT EXISTS public.bio_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'instagram',
  bio_text TEXT NOT NULL,
  score INTEGER,
  structure_type TEXT,
  source TEXT DEFAULT 'generated',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.bio_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bio versions" ON public.bio_versions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bio versions" ON public.bio_versions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_bio_versions_user ON public.bio_versions(user_id, platform, created_at DESC);
