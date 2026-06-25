-- Lot 3 (audit) : rate-limit DURABLE pour l'endpoint public mini-audit-instagram.
-- Remplace le compteur en mémoire (Map) qui se réinitialisait à chaque cold start de l'edge function,
-- rendant la limite "3 audits / heure / IP" inopérante.

CREATE TABLE IF NOT EXISTS public.mini_audit_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  handle text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mini_audit_attempts_ip_time
  ON public.mini_audit_attempts (ip, created_at);

-- Table interne d'anti-abus : accès uniquement via service-role (edge function).
-- RLS activé sans aucune policy => tout refusé aux clients normaux.
ALTER TABLE public.mini_audit_attempts ENABLE ROW LEVEL SECURITY;
