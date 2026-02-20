
CREATE TABLE public.brand_proposition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  step_1_what TEXT,
  step_2a_process TEXT,
  step_2b_values TEXT,
  step_2c_feedback TEXT,
  step_2d_refuse TEXT,
  step_3_for_whom TEXT,
  version_complete TEXT,
  version_short TEXT,
  version_emotional TEXT,
  version_pitch TEXT,
  version_final TEXT,
  current_step INTEGER DEFAULT 1,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.brand_proposition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own proposition" ON public.brand_proposition FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own proposition" ON public.brand_proposition FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own proposition" ON public.brand_proposition FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own proposition" ON public.brand_proposition FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_brand_proposition_updated_at
  BEFORE UPDATE ON public.brand_proposition
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
