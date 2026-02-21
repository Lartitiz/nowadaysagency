
-- Engagement checklist daily logs
CREATE TABLE public.engagement_checklist_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  log_date DATE NOT NULL,
  items_checked JSONB DEFAULT '[]'::jsonb,
  items_total INTEGER DEFAULT 5,
  streak_maintained BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, log_date)
);

ALTER TABLE public.engagement_checklist_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own checklist logs" ON public.engagement_checklist_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own checklist logs" ON public.engagement_checklist_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own checklist logs" ON public.engagement_checklist_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own checklist logs" ON public.engagement_checklist_logs FOR DELETE USING (auth.uid() = user_id);

-- Engagement streaks
CREATE TABLE public.engagement_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  current_streak INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  last_check_date DATE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.engagement_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own streak" ON public.engagement_streaks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own streak" ON public.engagement_streaks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own streak" ON public.engagement_streaks FOR UPDATE USING (auth.uid() = user_id);

-- Engagement weekly metrics
CREATE TABLE public.engagement_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  week_start DATE NOT NULL,
  followers INTEGER,
  avg_reach INTEGER,
  avg_likes INTEGER,
  avg_saves INTEGER,
  dm_received INTEGER,
  profile_visits INTEGER,
  link_clicks INTEGER,
  launch_signups INTEGER,
  launch_dm INTEGER,
  launch_link_clicks INTEGER,
  launch_story_views INTEGER,
  ai_insight TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, week_start)
);

ALTER TABLE public.engagement_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own metrics" ON public.engagement_metrics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own metrics" ON public.engagement_metrics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own metrics" ON public.engagement_metrics FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own metrics" ON public.engagement_metrics FOR DELETE USING (auth.uid() = user_id);

-- Strategic contacts
CREATE TABLE public.engagement_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  pseudo TEXT NOT NULL,
  tag TEXT DEFAULT 'paire',
  description TEXT,
  notes TEXT,
  last_interaction DATE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.engagement_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contacts" ON public.engagement_contacts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own contacts" ON public.engagement_contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own contacts" ON public.engagement_contacts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own contacts" ON public.engagement_contacts FOR DELETE USING (auth.uid() = user_id);
