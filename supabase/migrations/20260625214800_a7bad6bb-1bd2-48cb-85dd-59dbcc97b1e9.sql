DELETE FROM public.promo_redemptions a USING public.promo_redemptions b
  WHERE a.ctid < b.ctid AND a.user_id = b.user_id AND a.promo_code_id = b.promo_code_id;
ALTER TABLE public.promo_redemptions
  ADD CONSTRAINT uniq_promo_redemption_user_code UNIQUE (user_id, promo_code_id);

DELETE FROM public.purchases a USING public.purchases b
  WHERE a.ctid < b.ctid AND a.stripe_checkout_session_id = b.stripe_checkout_session_id
    AND a.stripe_checkout_session_id IS NOT NULL;
ALTER TABLE public.purchases
  ADD CONSTRAINT uniq_purchase_checkout_session UNIQUE (stripe_checkout_session_id);