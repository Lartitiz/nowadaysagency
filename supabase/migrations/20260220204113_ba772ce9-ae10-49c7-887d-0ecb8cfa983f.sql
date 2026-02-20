
-- Create storytelling table
CREATE TABLE public.storytelling (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  step_1_raw TEXT DEFAULT '',
  step_2_location TEXT DEFAULT '',
  step_3_action TEXT DEFAULT '',
  step_4_thoughts TEXT DEFAULT '',
  step_5_emotions TEXT DEFAULT '',
  step_6_full_story TEXT DEFAULT '',
  step_7_polished TEXT DEFAULT '',
  pitch_short TEXT DEFAULT '',
  pitch_medium TEXT DEFAULT '',
  pitch_long TEXT DEFAULT '',
  current_step INTEGER DEFAULT 1,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.storytelling ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own storytelling" ON public.storytelling FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own storytelling" ON public.storytelling FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own storytelling" ON public.storytelling FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own storytelling" ON public.storytelling FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_storytelling_updated_at
  BEFORE UPDATE ON public.storytelling
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
