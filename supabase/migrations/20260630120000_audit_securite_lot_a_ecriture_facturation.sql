-- ============================================================================
-- Audit technique transverse (30/06) — LOT A : durcissement écriture / facturation
-- Réf. findings : project_audit_bdd_securite (passe 2, vérifiés à la main).
-- Toutes les opérations sont IDEMPOTENTES (rejouables sans effet de bord).
-- Ne casse aucun flux légitime (vérifié : Stripe/RPC/edges écrivent en service_role).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) FACTURATION — bloquer l'auto-attribution du plan payant
--    Faille : un owner pouvait `UPDATE workspaces SET plan='binome'` (policy UPDATE
--    sans restriction de colonne) -> plan-limiter.getWorkspacePlan lit ça -> quota illimité.
--    Fix : workspaces.plan n'est plus écrivable par les clients. Seul Stripe (service_role)
--    l'écrit ; aucun flux authentifié ne l'écrit (vérifié). Les owners gardent name/avatar.
-- ----------------------------------------------------------------------------
REVOKE UPDATE (plan) ON public.workspaces FROM authenticated, anon;

-- ----------------------------------------------------------------------------
-- 2) CRÉDITS — bloquer l'auto-crédit + interdire les crédits négatifs
--    Faille : `UPDATE profiles SET bonus_credits=99999` (policy UPDATE sans
--    restriction de colonne ; le REVOKE existant ne couvrait que la RPC).
--    bonus_credits n'est écrit légitimement que par la RPC SECURITY DEFINER
--    increment_bonus_credits et par les edges (getServiceClient) -> insensibles au REVOKE.
-- ----------------------------------------------------------------------------
REVOKE UPDATE (bonus_credits) ON public.profiles FROM authenticated, anon;

-- Nettoyer un éventuel solde négatif (legacy race condition) avant d'armer la contrainte.
UPDATE public.profiles SET bonus_credits = 0 WHERE bonus_credits < 0;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_bonus_credits_nonneg;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_bonus_credits_nonneg CHECK (bonus_credits >= 0);

-- WITH CHECK manquant sur l'UPDATE profiles (fige l'identité de la ligne à l'écriture).
-- NB : ne restreint pas les colonnes -> l'admin garde l'écriture légitime de current_plan
-- (KickoffPreparation / CoachingSessionManager), qui n'est PAS une source de quota.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3) SUBSCRIPTIONS — réserver au service_role la policy de gestion
--    Faille : policy nommée "Service role can manage" mais déclarée `FOR ALL USING(true)`
--    SANS `TO service_role` -> s'appliquait à tous les rôles (authenticated) = lecture/
--    écriture cross-tenant des abonnements. (La policy SELECT own-row reste en place.)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role can manage subscriptions" ON public.subscriptions;
CREATE POLICY "Service role can manage subscriptions" ON public.subscriptions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 4) DEBUG — retirer les fonctions de debug exposées à PUBLIC (anon)
--    Faille : debug_vault_secret_names() / debug_service_role_sources() étaient
--    GRANT EXECUTE ... TO PUBLIC -> un anonyme énumérait les NOMS des secrets du Vault
--    et confirmait présence/longueur de la service_role key. Scaffolding du 26/06.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.debug_vault_secret_names();
DROP FUNCTION IF EXISTS public.debug_service_role_sources();

-- ----------------------------------------------------------------------------
-- 5) STORAGE — repasser en privé les buckets servant du contenu pré-publication
--    Faille : instagram-publish + canva-import étaient `public=true` (servis via
--    /object/public/... sans RLS) alors que les edges servent déjà des URLs signées.
--    NB : l'edge social-canva-import recrée le bucket en public -> corrigé en LOT B (code).
-- ----------------------------------------------------------------------------
UPDATE storage.buckets SET public = false WHERE id IN ('instagram-publish', 'canva-import');
