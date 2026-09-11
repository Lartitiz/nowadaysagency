-- Une seule tentative de souscription par compte, partagée entre onglets.
CREATE TABLE public.checkout_attempts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL DEFAULT gen_random_uuid(),
  params jsonb NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours',
  stripe_session_id text
);
ALTER TABLE public.checkout_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_attempts FROM anon, authenticated;
GRANT ALL ON public.checkout_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_subscription_checkout(p_user_id uuid, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE attempt public.checkout_attempts;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.checkout_attempts(user_id, params) VALUES(p_user_id, p_params)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO attempt FROM public.checkout_attempts WHERE user_id = p_user_id FOR UPDATE;
  IF attempt.expires_at <= now() THEN
    UPDATE public.checkout_attempts SET attempt_id = gen_random_uuid(), params = p_params,
      expires_at = now() + interval '2 hours', stripe_session_id = NULL
      WHERE user_id = p_user_id RETURNING * INTO attempt;
  END IF;
  RETURN to_jsonb(attempt);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reserve_subscription_checkout(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_subscription_checkout(uuid,jsonb) TO service_role;

-- La vérification SQL tient aussi si promo et webhook s'exécutent simultanément.
CREATE OR REPLACE FUNCTION public.protect_paid_subscription_from_promo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.source = 'promo' AND NEW.status = 'active' AND OLD.stripe_subscription_id IS NOT NULL
    AND coalesce(OLD.status, '') NOT IN ('canceled', 'incomplete_expired') THEN
    RAISE EXCEPTION 'active_stripe_subscription';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER prevent_promo_over_paid_subscription BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.protect_paid_subscription_from_promo();
