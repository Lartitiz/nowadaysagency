
-- Create weekly_missions table
CREATE TABLE public.weekly_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  week_start DATE NOT NULL,
  mission_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'important',
  module TEXT,
  route TEXT,
  estimated_minutes INTEGER,
  is_done BOOLEAN NOT NULL DEFAULT false,
  auto_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_missions_user_week ON public.weekly_missions(user_id, week_start);

-- Unique constraint to avoid duplicating same mission in same week
CREATE UNIQUE INDEX idx_missions_unique ON public.weekly_missions(user_id, week_start, mission_key);

-- Enable RLS
ALTER TABLE public.weekly_missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own missions" ON public.weekly_missions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own missions" ON public.weekly_missions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own missions" ON public.weekly_missions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own missions" ON public.weekly_missions FOR DELETE USING (auth.uid() = user_id);
