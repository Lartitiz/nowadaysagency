
-- Create persona table
CREATE TABLE public.persona (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  starting_point TEXT DEFAULT '',
  step_1_frustrations TEXT DEFAULT '',
  step_2_transformation TEXT DEFAULT '',
  step_3a_objections TEXT DEFAULT '',
  step_3b_cliches TEXT DEFAULT '',
  step_4_beautiful TEXT DEFAULT '',
  step_4_inspiring TEXT DEFAULT '',
  step_4_repulsive TEXT DEFAULT '',
  step_4_feeling TEXT DEFAULT '',
  step_4_pinterest_url TEXT DEFAULT '',
  step_5_actions TEXT DEFAULT '',
  pitch_short TEXT DEFAULT '',
  pitch_medium TEXT DEFAULT '',
  pitch_long TEXT DEFAULT '',
  current_step INTEGER DEFAULT 1,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.persona ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own persona" ON public.persona FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own persona" ON public.persona FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own persona" ON public.persona FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own persona" ON public.persona FOR DELETE USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE TRIGGER update_persona_updated_at
  BEFORE UPDATE ON public.persona
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
