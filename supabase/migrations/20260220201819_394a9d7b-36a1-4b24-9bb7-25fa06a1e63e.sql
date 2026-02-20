
-- Create content_drafts table
CREATE TABLE public.content_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  idea_id UUID REFERENCES public.saved_ideas(id) ON DELETE SET NULL,
  canal TEXT DEFAULT 'instagram',
  objectif TEXT,
  format TEXT,
  theme TEXT,
  accroche TEXT,
  content TEXT,
  format_technique TEXT,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.content_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own drafts" ON public.content_drafts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own drafts" ON public.content_drafts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own drafts" ON public.content_drafts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own drafts" ON public.content_drafts FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_content_drafts_updated_at
BEFORE UPDATE ON public.content_drafts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add objectif column to saved_ideas if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='saved_ideas' AND column_name='objectif') THEN
    ALTER TABLE public.saved_ideas ADD COLUMN objectif TEXT;
  END IF;
END $$;
