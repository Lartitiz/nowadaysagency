
CREATE TABLE public.social_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('instagram', 'linkedin', 'pinterest')),
  platform_account_id text,
  platform_account_name text,
  access_token text NOT NULL,
  token_expires_at timestamptz,
  scopes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unicité : une seule connexion par plateforme par (workspace, user). NULL workspace traité comme valeur distincte.
CREATE UNIQUE INDEX social_connections_unique_with_ws
  ON public.social_connections (workspace_id, user_id, platform)
  WHERE workspace_id IS NOT NULL;

CREATE UNIQUE INDEX social_connections_unique_no_ws
  ON public.social_connections (user_id, platform)
  WHERE workspace_id IS NULL;

CREATE INDEX social_connections_user_idx ON public.social_connections (user_id);
CREATE INDEX social_connections_workspace_idx ON public.social_connections (workspace_id);

-- GRANTS : service_role uniquement. Pas d'accès anon/authenticated => jetons jamais exposés au client.
GRANT ALL ON public.social_connections TO service_role;

ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;

-- Pas de policy SELECT/INSERT/UPDATE/DELETE pour authenticated => la table est invisible côté client.
-- Toute lecture/écriture passe par les edge functions en service-role.

CREATE TRIGGER update_social_connections_updated_at
  BEFORE UPDATE ON public.social_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
