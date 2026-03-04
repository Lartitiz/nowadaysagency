
-- Fix overly permissive INSERT policy on diagnostic_results
DROP POLICY IF EXISTS "Service role insert diagnostics" ON public.diagnostic_results;
CREATE POLICY "Users can insert own diagnostics" ON public.diagnostic_results FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
