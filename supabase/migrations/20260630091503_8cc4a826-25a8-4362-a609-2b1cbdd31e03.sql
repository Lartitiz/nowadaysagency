CREATE OR REPLACE FUNCTION public.consume_bonus_credit(p_user_id uuid)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.profiles SET bonus_credits = bonus_credits - 1
  WHERE user_id = p_user_id AND bonus_credits > 0
  RETURNING bonus_credits;
$$;
REVOKE EXECUTE ON FUNCTION public.consume_bonus_credit(uuid) FROM anon, authenticated;