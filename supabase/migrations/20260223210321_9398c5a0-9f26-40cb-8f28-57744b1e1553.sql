
-- Fix coaching_programs: allow coach by user_id too
DROP POLICY IF EXISTS "coach_all_programs" ON public.coaching_programs;
CREATE POLICY "coach_all_programs" ON public.coaching_programs
  FOR ALL
  USING (
    auth.uid() = coach_user_id
    OR (auth.jwt() ->> 'email') = 'laetitia@nowadaysagency.com'
    OR (auth.jwt() ->> 'email') = 'laetitiamattioli@gmail.com'
  );

-- Fix coaching_sessions: allow coach by looking up coach_user_id
DROP POLICY IF EXISTS "coach_all_sessions" ON public.coaching_sessions;
CREATE POLICY "coach_all_sessions" ON public.coaching_sessions
  FOR ALL
  USING (
    program_id IN (
      SELECT id FROM coaching_programs WHERE coach_user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'laetitia@nowadaysagency.com'
    OR (auth.jwt() ->> 'email') = 'laetitiamattioli@gmail.com'
  );
