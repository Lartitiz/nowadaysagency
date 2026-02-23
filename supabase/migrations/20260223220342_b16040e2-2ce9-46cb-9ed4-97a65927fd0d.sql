
-- Table for intake questionnaires (Now Pilot kick-off prep)
CREATE TABLE IF NOT EXISTS public.intake_questionnaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID REFERENCES public.coaching_programs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  messages JSONB DEFAULT '[]'::jsonb,
  extracted_data JSONB DEFAULT '{}'::jsonb,
  kickoff_summary TEXT,
  suggested_agenda JSONB,
  missing_topics JSONB,
  question_count INT DEFAULT 0,
  is_complete BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.intake_questionnaires ENABLE ROW LEVEL SECURITY;

-- Policies: users can read/write their own, admin can read all
CREATE POLICY "Users can view their own intake" ON public.intake_questionnaires
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own intake" ON public.intake_questionnaires
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own intake" ON public.intake_questionnaires
  FOR UPDATE USING (auth.uid() = user_id);

-- Admin policy (Laetitia can see all via coaching_programs join)
CREATE POLICY "Admin can view all intakes" ON public.intake_questionnaires
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.coaching_programs cp
      WHERE cp.id = intake_questionnaires.program_id
      AND cp.coach_user_id = auth.uid()
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_intake_questionnaires_updated_at
  BEFORE UPDATE ON public.intake_questionnaires
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
