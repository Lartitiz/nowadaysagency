-- Function: delete a workspace by cleaning all referencing rows first.
-- Permission: caller must be a manager or owner of the workspace.
CREATE OR REPLACE FUNCTION public.delete_workspace_with_cleanup(_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _role text;
  _rec record;
  _sql text;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Permission check: must be owner or manager
  SELECT role INTO _role
  FROM public.workspace_members
  WHERE workspace_id = _workspace_id AND user_id = _caller
  LIMIT 1;

  IF _role IS NULL OR _role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Access denied: you must be owner or manager of this workspace';
  END IF;

  -- Loop through every table that has a FK to public.workspaces and delete rows
  -- Skip workspace_members and workspace_invitations (they CASCADE) and workspaces itself
  FOR _rec IN
    SELECT conrelid::regclass::text AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.workspaces'::regclass
      AND conrelid::regclass::text NOT IN ('workspace_members', 'workspace_invitations')
  LOOP
    _sql := format('DELETE FROM %s WHERE %I = $1', _rec.tbl, _rec.col);
    EXECUTE _sql USING _workspace_id;
  END LOOP;

  -- Delete workspace_invitations + workspace_members (CASCADE will handle but be explicit)
  DELETE FROM public.workspace_invitations WHERE workspace_id = _workspace_id;
  DELETE FROM public.workspace_members WHERE workspace_id = _workspace_id;

  -- Finally, delete the workspace itself
  DELETE FROM public.workspaces WHERE id = _workspace_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_workspace_with_cleanup(uuid) TO authenticated;