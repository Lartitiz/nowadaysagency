
CREATE TABLE public.voice_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id),
  guide_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.voice_guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own voice guides" ON public.voice_guides FOR ALL USING (auth.uid() = user_id);
