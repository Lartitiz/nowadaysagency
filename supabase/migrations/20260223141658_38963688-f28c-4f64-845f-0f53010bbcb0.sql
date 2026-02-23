
CREATE TABLE IF NOT EXISTS public.assistant_undo_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT,
  previous_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.assistant_undo_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own undo logs"
ON public.assistant_undo_log FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own undo logs"
ON public.assistant_undo_log FOR DELETE
USING (auth.uid() = user_id);

-- Service role inserts via edge function, no INSERT policy needed for users
