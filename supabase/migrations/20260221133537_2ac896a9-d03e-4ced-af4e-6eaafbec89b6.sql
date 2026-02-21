
CREATE TABLE IF NOT EXISTS public.website_about (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  angle TEXT,
  title TEXT,
  story TEXT,
  values_blocks JSONB,
  approach TEXT,
  for_whom TEXT,
  cta TEXT,
  custom_facts JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS website_about_user_id_unique ON public.website_about(user_id);

ALTER TABLE public.website_about ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own about" ON public.website_about FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own about" ON public.website_about FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own about" ON public.website_about FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own about" ON public.website_about FOR DELETE USING (auth.uid() = user_id);
