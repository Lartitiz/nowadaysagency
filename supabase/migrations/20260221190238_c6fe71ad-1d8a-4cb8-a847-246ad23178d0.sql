
-- Reels scripts table
CREATE TABLE public.reels_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  objective TEXT,
  face_cam TEXT,
  subject TEXT,
  time_available TEXT,
  is_launch BOOLEAN DEFAULT FALSE,
  hook_type TEXT,
  hook_text TEXT,
  format_type TEXT,
  duree_cible TEXT,
  script_result JSONB,
  caption TEXT,
  hashtags JSONB,
  cover_text TEXT,
  alt_text TEXT,
  published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.reels_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reels scripts" ON public.reels_scripts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reels scripts" ON public.reels_scripts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reels scripts" ON public.reels_scripts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reels scripts" ON public.reels_scripts FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_reels_scripts_user ON public.reels_scripts(user_id, created_at DESC);

-- Reels metrics table
CREATE TABLE public.reels_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  week_start DATE NOT NULL,
  reels_published INTEGER DEFAULT 0,
  total_views INTEGER,
  avg_engagement_rate DECIMAL,
  total_shares INTEGER,
  total_saves INTEGER,
  total_follows_gained INTEGER,
  best_reel_subject TEXT,
  best_reel_views INTEGER,
  best_reel_retention DECIMAL,
  ai_insight TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.reels_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reels metrics" ON public.reels_metrics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reels metrics" ON public.reels_metrics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reels metrics" ON public.reels_metrics FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reels metrics" ON public.reels_metrics FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_reels_metrics_user_week ON public.reels_metrics(user_id, week_start DESC);
