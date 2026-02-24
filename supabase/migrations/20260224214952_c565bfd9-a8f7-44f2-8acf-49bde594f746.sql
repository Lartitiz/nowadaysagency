-- Fonction pour trouver le workspace_id d'un utilisateur (owner)
-- Utilisée par l'admin pour accéder aux espaces clients
CREATE OR REPLACE FUNCTION public.get_user_owner_workspace(target_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT workspace_id FROM public.workspace_members
  WHERE user_id = target_user_id AND role = 'owner'
  LIMIT 1;
$$;