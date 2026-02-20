
-- Create instagram_highlights table
CREATE TABLE public.instagram_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  emoji TEXT,
  role TEXT,
  stories JSONB DEFAULT '[]'::jsonb,
  sort_order INTEGER DEFAULT 0,
  is_selected BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own highlights" ON public.instagram_highlights FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own highlights" ON public.instagram_highlights FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own highlights" ON public.instagram_highlights FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own highlights" ON public.instagram_highlights FOR DELETE USING (auth.uid() = user_id);

-- Create instagram_highlights_questions table
CREATE TABLE public.instagram_highlights_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  frequent_questions TEXT,
  client_journey TEXT,
  recurring_content TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_highlights_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own highlight questions" ON public.instagram_highlights_questions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own highlight questions" ON public.instagram_highlights_questions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own highlight questions" ON public.instagram_highlights_questions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own highlight questions" ON public.instagram_highlights_questions FOR DELETE USING (auth.uid() = user_id);
