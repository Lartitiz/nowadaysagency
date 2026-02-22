
-- New monthly stats table
CREATE TABLE IF NOT EXISTS public.monthly_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  month_date DATE NOT NULL, -- first day of month e.g. 2026-02-01
  
  -- Objectif et contenu
  objective TEXT,
  content_published TEXT,
  
  -- Instagram
  reach INT,
  stories_coverage INT,
  views INT,
  profile_visits INT,
  website_clicks INT,
  interactions INT,
  accounts_engaged INT,
  followers_engaged INT,
  followers INT,
  followers_gained INT,
  followers_lost INT,
  
  -- Emailing
  email_signups INT,
  newsletter_subscribers INT,
  
  -- Site web
  website_visitors INT,
  ga4_users INT,
  traffic_search INT,
  traffic_social INT,
  traffic_pinterest INT,
  traffic_instagram INT,
  
  -- Pages de vente
  page_views_plan INT,
  page_views_academy INT,
  page_views_agency INT,
  
  -- Business
  discovery_calls INT,
  clients_signed INT,
  revenue DECIMAL,
  ad_budget DECIMAL,
  
  -- Lancement
  has_launch BOOLEAN DEFAULT FALSE,
  launch_signups INT,
  launch_dms INT,
  launch_link_clicks INT,
  launch_story_views INT,
  launch_conversions INT,
  
  -- IA
  ai_analysis TEXT,
  ai_analyzed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, month_date)
);

CREATE INDEX idx_monthly_stats_user ON public.monthly_stats(user_id, month_date DESC);

-- Enable RLS
ALTER TABLE public.monthly_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own monthly stats"
  ON public.monthly_stats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own monthly stats"
  ON public.monthly_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own monthly stats"
  ON public.monthly_stats FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own monthly stats"
  ON public.monthly_stats FOR DELETE
  USING (auth.uid() = user_id);
