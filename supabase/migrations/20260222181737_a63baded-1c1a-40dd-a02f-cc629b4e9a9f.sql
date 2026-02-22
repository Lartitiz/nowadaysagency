
-- Table for comment history
CREATE TABLE IF NOT EXISTS public.engagement_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  contact_id UUID REFERENCES public.engagement_contacts(id) ON DELETE SET NULL,
  prospect_id UUID REFERENCES public.prospects(id) ON DELETE SET NULL,
  
  target_username TEXT NOT NULL,
  post_caption TEXT,
  user_intent TEXT,
  
  comment_type TEXT, -- 'value', 'question', 'remarkable', 'expertise'
  generated_text TEXT,
  final_text TEXT,
  
  was_posted BOOLEAN DEFAULT FALSE,
  posted_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.engagement_comments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own comments" ON public.engagement_comments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own comments" ON public.engagement_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own comments" ON public.engagement_comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON public.engagement_comments FOR DELETE USING (auth.uid() = user_id);

-- Index
CREATE INDEX idx_engagement_comments_user ON public.engagement_comments(user_id);
CREATE INDEX idx_engagement_comments_contact ON public.engagement_comments(contact_id);
CREATE INDEX idx_engagement_comments_prospect ON public.engagement_comments(prospect_id);
