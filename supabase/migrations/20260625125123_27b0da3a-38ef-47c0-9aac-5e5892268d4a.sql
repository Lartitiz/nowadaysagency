DROP POLICY IF EXISTS "Public read access for audit-screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for audit-posts" ON storage.objects;

CREATE TABLE IF NOT EXISTS public.mini_audit_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  handle text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mini_audit_attempts_ip_time
  ON public.mini_audit_attempts (ip, created_at);

GRANT ALL ON public.mini_audit_attempts TO service_role;

ALTER TABLE public.mini_audit_attempts ENABLE ROW LEVEL SECURITY;