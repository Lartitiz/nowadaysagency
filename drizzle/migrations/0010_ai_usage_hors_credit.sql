CREATE TABLE IF NOT EXISTS public.ai_usage_hors_credit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  workspace_id uuid,
  source text NOT NULL,
  action_type text NOT NULL,
  model_used text,
  tokens_used integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_hors_credit_created
  ON public.ai_usage_hors_credit (created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_hors_credit_user_source
  ON public.ai_usage_hors_credit (user_id, source, created_at);

ALTER TABLE public.ai_usage_hors_credit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage_hors_credit FROM anon, authenticated;