
CREATE TABLE public.dismissed_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  suggestion_type TEXT NOT NULL,
  context_key TEXT NOT NULL,
  dismissed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, suggestion_type, context_key)
);

ALTER TABLE public.dismissed_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own dismissed suggestions"
  ON public.dismissed_suggestions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
