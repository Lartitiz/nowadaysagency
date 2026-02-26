
CREATE OR REPLACE FUNCTION public.increment_bonus_credits(user_uuid uuid, amount integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  UPDATE profiles SET bonus_credits = coalesce(bonus_credits, 0) + amount WHERE user_id = user_uuid;
$$;

CREATE OR REPLACE FUNCTION public.increment_promo_uses(promo_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  UPDATE promo_codes SET current_uses = coalesce(current_uses, 0) + 1 WHERE id = promo_id;
$$;
