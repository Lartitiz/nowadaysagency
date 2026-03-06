CREATE POLICY "Service role can insert email_sends"
ON public.email_sends
FOR INSERT
TO service_role
WITH CHECK (true);