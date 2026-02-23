-- Allow clients to update their own deliverables (e.g. seen_by_client)
CREATE POLICY "client_update_own_deliverables"
  ON public.coaching_deliverables FOR UPDATE
  USING (program_id IN (
    SELECT id FROM coaching_programs WHERE client_user_id = auth.uid()
  ))
  WITH CHECK (program_id IN (
    SELECT id FROM coaching_programs WHERE client_user_id = auth.uid()
  ));