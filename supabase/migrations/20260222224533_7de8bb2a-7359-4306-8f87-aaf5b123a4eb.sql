
-- Create unified contacts table
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  
  -- Identity
  username TEXT NOT NULL,
  display_name TEXT,
  activity TEXT,
  platform TEXT NOT NULL DEFAULT 'instagram',
  
  -- Type: 'network' or 'prospect'
  contact_type TEXT NOT NULL DEFAULT 'network',
  
  -- Network fields
  network_category TEXT, -- 'pair', 'media', 'partner', 'prescriber', 'inspiration'
  
  -- Prospect pipeline fields
  prospect_stage TEXT DEFAULT 'to_contact',
  decision_phase TEXT,
  target_offer TEXT,
  potential_value NUMERIC,
  conversion_amount NUMERIC,
  source TEXT,
  strengths TEXT,
  probable_problem TEXT,
  noted_interest TEXT,
  to_avoid TEXT,
  last_dm_context TEXT,
  last_conversation TEXT,
  relevant_offer TEXT,
  
  -- Common
  notes TEXT,
  last_interaction_at TIMESTAMPTZ,
  next_followup_at TIMESTAMPTZ,
  next_followup_text TEXT,
  converted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX idx_contacts_user_type ON public.contacts(user_id, contact_type);

-- RLS
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own contacts" ON public.contacts
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create contact_interactions table
CREATE TABLE IF NOT EXISTS public.contact_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  interaction_type TEXT NOT NULL,
  content TEXT,
  ai_generated BOOLEAN DEFAULT false,
  responded BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own contact interactions" ON public.contact_interactions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Migrate engagement_contacts data
INSERT INTO public.contacts (user_id, username, display_name, activity, contact_type, network_category, notes, last_interaction_at, created_at, updated_at)
SELECT user_id, pseudo, description, NULL, 'network', 
  CASE tag 
    WHEN 'paire' THEN 'pair'
    WHEN 'prospect' THEN 'pair'
    WHEN 'collab' THEN 'partner'
    WHEN 'influenceur' THEN 'prescriber'
    WHEN 'client' THEN 'pair'
    ELSE 'pair'
  END,
  notes, last_interaction, created_at, updated_at
FROM public.engagement_contacts;

-- Migrate prospects data  
INSERT INTO public.contacts (user_id, username, display_name, activity, contact_type, prospect_stage, decision_phase, source, strengths, probable_problem, noted_interest, to_avoid, last_dm_context, last_conversation, relevant_offer, conversion_amount, notes, last_interaction_at, next_followup_at, next_followup_text, created_at, updated_at)
SELECT user_id, instagram_username, display_name, activity, 'prospect',
  stage, decision_phase, source, strengths, probable_problem, noted_interest, to_avoid, last_dm_context, last_conversation, relevant_offer, conversion_amount, note, last_interaction_at, next_reminder_at, next_reminder_text, created_at, updated_at
FROM public.prospects;

-- Migrate prospect_interactions (map old prospect_id to new contact_id)
INSERT INTO public.contact_interactions (contact_id, user_id, interaction_type, content, ai_generated, responded, created_at)
SELECT c.id, pi.user_id, pi.interaction_type, pi.content, pi.ai_generated, pi.responded, pi.created_at
FROM public.prospect_interactions pi
JOIN public.prospects p ON pi.prospect_id = p.id
JOIN public.contacts c ON c.username = p.instagram_username AND c.user_id = p.user_id AND c.contact_type = 'prospect';

-- Updated_at trigger
CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
