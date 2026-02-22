
-- Prospects table (mini-CRM)
CREATE TABLE public.prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  instagram_username TEXT NOT NULL,
  display_name TEXT,
  activity TEXT,
  strengths TEXT,
  probable_problem TEXT,
  source TEXT DEFAULT 'other',
  note TEXT,
  stage TEXT DEFAULT 'to_contact',
  decision_phase TEXT DEFAULT 'unaware',
  relevant_offer TEXT,
  last_interaction_at TIMESTAMPTZ,
  next_reminder_at TIMESTAMPTZ,
  next_reminder_text TEXT,
  conversion_amount DECIMAL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, instagram_username)
);

ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own prospects" ON public.prospects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own prospects" ON public.prospects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own prospects" ON public.prospects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own prospects" ON public.prospects FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_prospects_user_stage ON public.prospects(user_id, stage);
CREATE INDEX idx_prospects_reminder ON public.prospects(user_id, next_reminder_at);

-- Prospect interactions table
CREATE TABLE public.prospect_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  interaction_type TEXT NOT NULL,
  content TEXT,
  ai_generated BOOLEAN DEFAULT false,
  responded BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.prospect_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own interactions" ON public.prospect_interactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own interactions" ON public.prospect_interactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own interactions" ON public.prospect_interactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own interactions" ON public.prospect_interactions FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_interactions_prospect ON public.prospect_interactions(prospect_id);

-- Trigger for updated_at on prospects
CREATE TRIGGER update_prospects_updated_at
  BEFORE UPDATE ON public.prospects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
