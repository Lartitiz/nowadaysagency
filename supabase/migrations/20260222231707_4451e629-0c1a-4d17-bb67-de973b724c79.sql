
-- Table for saved carousel drafts
CREATE TABLE IF NOT EXISTS public.generated_carousels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  carousel_type TEXT NOT NULL,
  subject TEXT,
  objective TEXT,
  hook_text TEXT,
  slide_count INTEGER DEFAULT 7,
  slides JSONB,
  caption TEXT,
  hashtags JSONB,
  quality_score INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  calendar_post_id UUID REFERENCES public.calendar_posts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.generated_carousels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own carousels"
  ON public.generated_carousels
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_generated_carousels_updated_at
  BEFORE UPDATE ON public.generated_carousels
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
