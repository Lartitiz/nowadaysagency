
-- Table: user_rhythm
CREATE TABLE public.user_rhythm (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  time_ideas_monthly INTEGER DEFAULT 60,
  time_visuals_per_content INTEGER DEFAULT 90,
  time_texts_per_content INTEGER DEFAULT 30,
  time_scheduling_per_content INTEGER DEFAULT 15,
  time_available_weekly INTEGER DEFAULT 120,
  organization_mode TEXT DEFAULT 'batching',
  preferred_slots TEXT,
  posts_per_week NUMERIC(3,1),
  stories_per_day INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.user_rhythm ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own rhythm" ON public.user_rhythm FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own rhythm" ON public.user_rhythm FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own rhythm" ON public.user_rhythm FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own rhythm" ON public.user_rhythm FOR DELETE USING (auth.uid() = user_id);

-- Table: engagement_exercise
CREATE TABLE public.engagement_exercise (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  follower_1_name TEXT DEFAULT '',
  follower_1_done BOOLEAN DEFAULT FALSE,
  follower_2_name TEXT DEFAULT '',
  follower_2_done BOOLEAN DEFAULT FALSE,
  follower_3_name TEXT DEFAULT '',
  follower_3_done BOOLEAN DEFAULT FALSE,
  follower_4_name TEXT DEFAULT '',
  follower_4_done BOOLEAN DEFAULT FALSE,
  follower_5_name TEXT DEFAULT '',
  follower_5_done BOOLEAN DEFAULT FALSE,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.engagement_exercise ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own exercise" ON public.engagement_exercise FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own exercise" ON public.engagement_exercise FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own exercise" ON public.engagement_exercise FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own exercise" ON public.engagement_exercise FOR DELETE USING (auth.uid() = user_id);

-- Table: engagement_weekly
CREATE TABLE public.engagement_weekly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  week_start DATE NOT NULL,
  objective INTEGER DEFAULT 10,
  dm_target INTEGER DEFAULT 4,
  dm_done INTEGER DEFAULT 0,
  comments_target INTEGER DEFAULT 4,
  comments_done INTEGER DEFAULT 0,
  replies_target INTEGER DEFAULT 2,
  replies_done INTEGER DEFAULT 0,
  total_done INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.engagement_weekly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own weekly" ON public.engagement_weekly FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own weekly" ON public.engagement_weekly FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own weekly" ON public.engagement_weekly FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own weekly" ON public.engagement_weekly FOR DELETE USING (auth.uid() = user_id);
