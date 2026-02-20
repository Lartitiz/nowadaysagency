
-- Add new columns to saved_ideas for the Ideas Box feature
ALTER TABLE public.saved_ideas ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'idea';
ALTER TABLE public.saved_ideas ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'to_explore';
ALTER TABLE public.saved_ideas ADD COLUMN IF NOT EXISTS content_draft TEXT;
ALTER TABLE public.saved_ideas ADD COLUMN IF NOT EXISTS accroche_short TEXT;
ALTER TABLE public.saved_ideas ADD COLUMN IF NOT EXISTS accroche_long TEXT;
ALTER TABLE public.saved_ideas ADD COLUMN IF NOT EXISTS format_technique TEXT;
ALTER TABLE public.saved_ideas ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.saved_ideas ADD COLUMN IF NOT EXISTS planned_date DATE;
ALTER TABLE public.saved_ideas ADD COLUMN IF NOT EXISTS calendar_post_id UUID REFERENCES public.calendar_posts(id) ON DELETE SET NULL;
ALTER TABLE public.saved_ideas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Auto-update updated_at
CREATE TRIGGER update_saved_ideas_updated_at
  BEFORE UPDATE ON public.saved_ideas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
