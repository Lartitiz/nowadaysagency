
-- Create calendar_posts table
CREATE TABLE public.calendar_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  theme TEXT NOT NULL,
  angle TEXT,
  status TEXT NOT NULL DEFAULT 'idea',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.calendar_posts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own calendar posts"
  ON public.calendar_posts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own calendar posts"
  ON public.calendar_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own calendar posts"
  ON public.calendar_posts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own calendar posts"
  ON public.calendar_posts FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_calendar_posts_updated_at
  BEFORE UPDATE ON public.calendar_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
