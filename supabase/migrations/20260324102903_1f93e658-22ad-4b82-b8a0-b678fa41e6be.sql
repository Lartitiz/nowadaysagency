CREATE TABLE IF NOT EXISTS public.frontend_debug_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_frontend_debug_logs_user ON public.frontend_debug_logs(user_id, created_at DESC);

ALTER TABLE public.frontend_debug_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own logs" ON public.frontend_debug_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);