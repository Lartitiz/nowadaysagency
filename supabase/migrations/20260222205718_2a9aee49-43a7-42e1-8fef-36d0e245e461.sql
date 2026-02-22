
-- Promo codes table
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  plan_granted TEXT NOT NULL DEFAULT 'outil',
  duration_days INT,
  max_uses INT,
  current_uses INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Promo redemptions table
CREATE TABLE IF NOT EXISTS public.promo_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  promo_code_id UUID NOT NULL REFERENCES public.promo_codes(id),
  redeemed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Add source column to subscriptions to distinguish promo vs stripe
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'stripe';

-- Enable RLS
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

-- Promo codes: anyone authenticated can read active codes (for validation)
CREATE POLICY "Anyone can read active promo codes"
  ON public.promo_codes FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Promo redemptions: users can only see their own
CREATE POLICY "Users can view own redemptions"
  ON public.promo_redemptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own redemptions"
  ON public.promo_redemptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Insert the first beta code
INSERT INTO public.promo_codes (code, plan_granted, duration_days, max_uses, is_active)
VALUES ('BETA2026', 'outil', 90, 50, true);
