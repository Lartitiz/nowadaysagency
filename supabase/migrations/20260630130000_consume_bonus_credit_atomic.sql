-- ============================================================================
-- Audit technique transverse (30/06) — LOT A-bis : décrément crédits ATOMIQUE
-- Réf. finding F-1 (race condition crédits).
-- ----------------------------------------------------------------------------
-- Avant : plan-limiter lisait bonus_credits puis écrivait (currentBonus - 1)
-- (read-modify-write non atomique) -> 2 générations concurrentes pouvaient
-- ne décrémenter qu'une fois (crédit perdu en faveur de l'utilisateur).
-- Après : un seul UPDATE conditionnel verrouille la ligne et ne décrémente
-- que si bonus_credits > 0 (jamais négatif, pas de course).
--
-- SECURITY DEFINER + search_path figé (cohérent avec les autres RPC du projet).
-- EXECUTE révoqué d'anon/authenticated : seules les edge functions (service_role,
-- qui appellent logUsage) l'utilisent. Idempotent (CREATE OR REPLACE).
-- À appliquer AVANT de redéployer les edges qui appellent la RPC.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.consume_bonus_credit(p_user_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
  SET bonus_credits = bonus_credits - 1
  WHERE user_id = p_user_id
    AND bonus_credits > 0
  RETURNING bonus_credits;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_bonus_credit(uuid) FROM anon, authenticated;
