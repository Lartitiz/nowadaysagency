DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
     AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name = 'workspace_id'
      AND c.table_name NOT IN ('workspace_members','workspace_invitations','profiles','subscriptions')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_immovable ON public.%I;', t);
    EXECUTE format(
      'CREATE POLICY tenant_immovable ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'WITH CHECK (workspace_id IS NULL OR public.user_has_workspace_access(workspace_id));', t);
  END LOOP;
END $$;