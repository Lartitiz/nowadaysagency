-- 1) workspaces.plan non modifiable côté client (anti auto-upgrade de plan)
CREATE OR REPLACE FUNCTION public.guard_workspace_billing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE jwt_role text := COALESCE((NULLIF(current_setting('request.jwt.claims', true),'')::json->>'role'),'service_role');
BEGIN
  IF jwt_role IN ('authenticated','anon') AND NOT public.has_role(auth.uid(),'admin')
     AND NEW.plan IS DISTINCT FROM OLD.plan THEN
    RAISE EXCEPTION 'workspaces.plan ne peut pas être modifié côté client';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS guard_workspace_billing ON public.workspaces;
CREATE TRIGGER guard_workspace_billing BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_billing();

-- 2) profiles : colonnes facturation/crédits non modifiables côté client
CREATE OR REPLACE FUNCTION public.guard_profile_billing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE jwt_role text := COALESCE((NULLIF(current_setting('request.jwt.claims', true),'')::json->>'role'),'service_role');
BEGIN
  IF jwt_role IN ('authenticated','anon') AND NOT public.has_role(auth.uid(),'admin')
     AND (NEW.bonus_credits IS DISTINCT FROM OLD.bonus_credits
       OR NEW.current_plan IS DISTINCT FROM OLD.current_plan
       OR NEW.plan_start_date IS DISTINCT FROM OLD.plan_start_date) THEN
    RAISE EXCEPTION 'profiles: colonnes de facturation non modifiables côté client';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS guard_profile_billing ON public.profiles;
CREATE TRIGGER guard_profile_billing BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_billing();

-- 3) bonus_credits jamais négatif
UPDATE public.profiles SET bonus_credits = 0 WHERE bonus_credits < 0;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_bonus_credits_nonneg;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_bonus_credits_nonneg CHECK (bonus_credits >= 0);

-- 4) ai_usage : retirer l'UPDATE client (le quota se compte sur ces lignes)
DROP POLICY IF EXISTS "Users can update own ai usage" ON public.ai_usage;

-- 5) supprimer les fonctions debug qui exposent l'inventaire du Vault à PUBLIC
DROP FUNCTION IF EXISTS public.debug_vault_secret_names();
DROP FUNCTION IF EXISTS public.debug_service_role_sources();