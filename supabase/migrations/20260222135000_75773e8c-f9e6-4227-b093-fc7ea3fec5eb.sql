
CREATE TABLE IF NOT EXISTS public.instagram_weekly_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  
  -- Compte
  followers INT,
  profile_visits INT,
  link_clicks INT,
  new_followers INT,
  
  -- Posts
  posts_count INT,
  posts_reach_avg INT,
  posts_likes_avg INT,
  posts_saves_avg INT,
  posts_comments_avg INT,
  posts_shares_avg INT,
  best_post TEXT,
  
  -- Reels
  reels_count INT,
  reels_views_avg INT,
  reels_likes_avg INT,
  reels_saves_avg INT,
  reels_shares_avg INT,
  best_reel TEXT,
  
  -- Stories
  stories_count INT,
  stories_views_avg INT,
  stories_replies INT,
  stories_sticker_clicks INT,
  stories_retention_pct DECIMAL,
  
  -- Engagement
  dm_received INT,
  dm_sent INT,
  comments_received INT,
  comments_made INT,
  
  -- Lancement
  launch_signups INT,
  launch_dms INT,
  launch_link_clicks INT,
  launch_story_views INT,
  launch_conversions INT,
  
  -- IA
  ai_analysis TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(user_id, week_start)
);

CREATE INDEX idx_weekly_stats_user ON public.instagram_weekly_stats(user_id, week_start DESC);

ALTER TABLE public.instagram_weekly_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own weekly stats"
  ON public.instagram_weekly_stats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own weekly stats"
  ON public.instagram_weekly_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own weekly stats"
  ON public.instagram_weekly_stats FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own weekly stats"
  ON public.instagram_weekly_stats FOR DELETE
  USING (auth.uid() = user_id);
