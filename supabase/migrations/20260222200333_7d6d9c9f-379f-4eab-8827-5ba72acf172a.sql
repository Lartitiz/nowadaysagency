
-- Subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  studio_months_paid INT DEFAULT 0,
  studio_start_date TIMESTAMPTZ,
  studio_end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage subscriptions"
  ON public.subscriptions FOR ALL
  USING (true)
  WITH CHECK (true);

-- Purchases table
CREATE TABLE IF NOT EXISTS public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  product_type TEXT NOT NULL,
  stripe_payment_intent_id TEXT,
  stripe_checkout_session_id TEXT,
  amount DECIMAL NOT NULL,
  currency TEXT DEFAULT 'eur',
  status TEXT DEFAULT 'pending',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases"
  ON public.purchases FOR SELECT
  USING (auth.uid() = user_id);

-- AI usage table
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  month TEXT NOT NULL,
  generation_count INT DEFAULT 0,
  audit_count INT DEFAULT 0,
  UNIQUE(user_id, month)
);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai usage"
  ON public.ai_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own ai usage"
  ON public.ai_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ai usage"
  ON public.ai_usage FOR UPDATE
  USING (auth.uid() = user_id);

-- Add current_plan to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_plan TEXT DEFAULT 'free';
