
-- Create linkedin_audit table
CREATE TABLE public.linkedin_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  profile_url TEXT,
  objective TEXT,
  current_rhythm TEXT,
  avg_views TEXT,
  connections_count TEXT,
  connection_types JSONB,
  acceptance_policy TEXT,
  proactive_requests TEXT,
  recommendations_count TEXT,
  content_types JSONB,
  engagement_type TEXT,
  accroche_style TEXT,
  recycling TEXT,
  publication_org TEXT,
  inbound_requests TEXT,
  screenshots JSONB DEFAULT '[]'::jsonb,
  score_global INTEGER,
  score_profil INTEGER,
  score_contenu INTEGER,
  score_strategie INTEGER,
  score_reseau INTEGER,
  audit_result JSONB,
  top_priorities JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.linkedin_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own linkedin audit" ON public.linkedin_audit FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own linkedin audit" ON public.linkedin_audit FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own linkedin audit" ON public.linkedin_audit FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own linkedin audit" ON public.linkedin_audit FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_linkedin_audit_user ON public.linkedin_audit(user_id);

-- Create storage bucket for linkedin audit screenshots
INSERT INTO storage.buckets (id, name, public) VALUES ('linkedin-audit-screenshots', 'linkedin-audit-screenshots', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload linkedin audit screenshots" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'linkedin-audit-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Anyone can view linkedin audit screenshots" ON storage.objects FOR SELECT USING (bucket_id = 'linkedin-audit-screenshots');
CREATE POLICY "Users can delete own linkedin audit screenshots" ON storage.objects FOR DELETE USING (bucket_id = 'linkedin-audit-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
