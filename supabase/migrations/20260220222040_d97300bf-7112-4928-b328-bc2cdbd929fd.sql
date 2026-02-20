
-- LinkedIn profile
CREATE TABLE public.linkedin_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT,
  custom_url TEXT,
  photo_done BOOLEAN DEFAULT FALSE,
  banner_done BOOLEAN DEFAULT FALSE,
  summary_storytelling TEXT,
  summary_pro TEXT,
  summary_final TEXT,
  title_done BOOLEAN DEFAULT FALSE,
  url_done BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.linkedin_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own linkedin profile" ON public.linkedin_profile FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own linkedin profile" ON public.linkedin_profile FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own linkedin profile" ON public.linkedin_profile FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own linkedin profile" ON public.linkedin_profile FOR DELETE USING (auth.uid() = user_id);

-- LinkedIn experiences
CREATE TABLE public.linkedin_experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  job_title TEXT,
  company TEXT,
  description_raw TEXT,
  description_optimized TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.linkedin_experiences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own experiences" ON public.linkedin_experiences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own experiences" ON public.linkedin_experiences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own experiences" ON public.linkedin_experiences FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own experiences" ON public.linkedin_experiences FOR DELETE USING (auth.uid() = user_id);

-- LinkedIn recommendations
CREATE TABLE public.linkedin_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  person_name TEXT,
  person_type TEXT DEFAULT 'client',
  request_sent BOOLEAN DEFAULT FALSE,
  reco_received BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.linkedin_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own recommendations" ON public.linkedin_recommendations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own recommendations" ON public.linkedin_recommendations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own recommendations" ON public.linkedin_recommendations FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own recommendations" ON public.linkedin_recommendations FOR DELETE USING (auth.uid() = user_id);

-- LinkedIn engagement weekly
CREATE TABLE public.engagement_weekly_linkedin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  week_start DATE NOT NULL,
  objective INTEGER DEFAULT 5,
  comments_target INTEGER DEFAULT 3,
  comments_done INTEGER DEFAULT 0,
  messages_target INTEGER DEFAULT 2,
  messages_done INTEGER DEFAULT 0,
  total_done INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.engagement_weekly_linkedin ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own linkedin weekly" ON public.engagement_weekly_linkedin FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own linkedin weekly" ON public.engagement_weekly_linkedin FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own linkedin weekly" ON public.engagement_weekly_linkedin FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own linkedin weekly" ON public.engagement_weekly_linkedin FOR DELETE USING (auth.uid() = user_id);
