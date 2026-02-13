
CREATE TABLE public.saved_ideas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  titre TEXT NOT NULL,
  format TEXT NOT NULL,
  angle TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ideas" ON public.saved_ideas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ideas" ON public.saved_ideas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own ideas" ON public.saved_ideas FOR DELETE USING (auth.uid() = user_id);
