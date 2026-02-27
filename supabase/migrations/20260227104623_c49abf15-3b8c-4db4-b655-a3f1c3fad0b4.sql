
-- Fix 1: subscriptions — drop overly permissive ALL policy
-- Service role (edge functions) bypasses RLS, so no explicit service role policy needed
DROP POLICY IF EXISTS "Service role can manage subscriptions" ON public.subscriptions;

-- Users only need to read their own subscription (already covered by existing SELECT policy)
-- No client-side INSERT/UPDATE/DELETE needed (handled by edge functions with service role)

-- Fix 2: audit_recommendations — restrict INSERT to own rows
DROP POLICY IF EXISTS "Service role can insert audit recommendations" ON public.audit_recommendations;

CREATE POLICY "Users can insert their own audit recommendations"
  ON public.audit_recommendations FOR INSERT
  WITH CHECK (auth.uid() = user_id);
