-- R3: legacy own-row and workspace policies are permissive and do not exclude
-- viewers. Keep reads/history untouched and intersect every client write with
-- the existing personal-owner / workspace-writer contract.
DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['calendar_posts','saved_ideas'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.crosspost_can_write(workspace_id,user_id))', relation_name || '_writer_insert', relation_name);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.crosspost_can_write(workspace_id,user_id)) WITH CHECK (public.crosspost_can_write(workspace_id,user_id))', relation_name || '_writer_update', relation_name);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.crosspost_can_write(workspace_id,user_id))', relation_name || '_writer_delete', relation_name);
  END LOOP;
END $$;
