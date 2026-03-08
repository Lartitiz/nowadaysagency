-- webhook_events is only written by the stripe-webhook edge function using service_role
-- No client should read or write this table directly
CREATE POLICY "No direct client access to webhook_events"
  ON public.webhook_events FOR ALL
  USING (false)
  WITH CHECK (false);