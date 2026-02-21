
-- Create instagram_audit table
CREATE TABLE public.instagram_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  score_global INTEGER,
  score_nom INTEGER,
  score_bio INTEGER,
  score_stories INTEGER,
  score_epingles INTEGER,
  score_feed INTEGER,
  score_edito INTEGER,
  resume TEXT,
  details JSONB,
  best_content TEXT,
  worst_content TEXT,
  current_rhythm TEXT,
  main_objective TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audits" ON public.instagram_audit FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own audits" ON public.instagram_audit FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own audits" ON public.instagram_audit FOR DELETE USING (auth.uid() = user_id);

-- Create instagram_pinned_posts table
CREATE TABLE public.instagram_pinned_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  post_type TEXT NOT NULL,
  has_existing BOOLEAN DEFAULT false,
  existing_description TEXT,
  generated_accroche TEXT,
  generated_content TEXT,
  generated_format TEXT,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_pinned_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pinned posts" ON public.instagram_pinned_posts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own pinned posts" ON public.instagram_pinned_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own pinned posts" ON public.instagram_pinned_posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own pinned posts" ON public.instagram_pinned_posts FOR DELETE USING (auth.uid() = user_id);

-- Create instagram_editorial_line table
CREATE TABLE public.instagram_editorial_line (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  main_objective TEXT,
  recommended_rhythm TEXT,
  pillar_distribution JSONB,
  preferred_formats JSONB,
  stop_doing TEXT,
  do_more TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_editorial_line ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own editorial line" ON public.instagram_editorial_line FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own editorial line" ON public.instagram_editorial_line FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own editorial line" ON public.instagram_editorial_line FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own editorial line" ON public.instagram_editorial_line FOR DELETE USING (auth.uid() = user_id);

-- Storage bucket for audit screenshots
INSERT INTO storage.buckets (id, name, public) VALUES ('audit-screenshots', 'audit-screenshots', false);

CREATE POLICY "Users can upload own screenshots" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'audit-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view own screenshots" ON storage.objects FOR SELECT USING (bucket_id = 'audit-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own screenshots" ON storage.objects FOR DELETE USING (bucket_id = 'audit-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
