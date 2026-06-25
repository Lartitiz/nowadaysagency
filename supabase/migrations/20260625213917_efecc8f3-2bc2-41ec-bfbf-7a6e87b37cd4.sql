CREATE TABLE IF NOT EXISTS public.oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  workspace_id uuid NULL,
  platform text NOT NULL DEFAULT 'instagram',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.oauth_states TO service_role;
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only.
CREATE INDEX IF NOT EXISTS oauth_states_created_at_idx ON public.oauth_states(created_at);