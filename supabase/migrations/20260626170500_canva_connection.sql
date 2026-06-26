-- Canva Connect : autoriser la plateforme 'canva' et stocker le refresh_token.
-- Les jetons d'accès Canva sont courts (~4 h) → on conserve le refresh_token
-- (long) pour rafraîchir l'accès au moment de l'import.

ALTER TABLE public.social_connections
  DROP CONSTRAINT IF EXISTS social_connections_platform_check;

ALTER TABLE public.social_connections
  ADD CONSTRAINT social_connections_platform_check
  CHECK (platform IN ('instagram', 'linkedin', 'canva', 'pinterest'));

ALTER TABLE public.social_connections
  ADD COLUMN IF NOT EXISTS refresh_token text;
