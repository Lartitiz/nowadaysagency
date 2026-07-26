CREATE OR REPLACE FUNCTION public.ensure_owner_workspace()
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _ws_id uuid; _prenom text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'ensure_owner_workspace: not authenticated'; END IF;
  SELECT workspace_id INTO _ws_id FROM public.workspace_members
    WHERE user_id = _uid AND role = 'owner' ORDER BY joined_at ASC LIMIT 1;
  IF _ws_id IS NOT NULL THEN RETURN _ws_id; END IF;
  SELECT prenom INTO _prenom FROM public.profiles WHERE user_id = _uid;
  INSERT INTO public.workspaces (name, created_by) VALUES (COALESCE(_prenom,'Mon espace'), _uid) RETURNING id INTO _ws_id;
  INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES (_ws_id, _uid, 'owner');
  RETURN _ws_id;
END; $function$;

GRANT EXECUTE ON FUNCTION public.ensure_owner_workspace() TO authenticated;

DO $backfill$
DECLARE _rec record; _ws_id uuid; _count int := 0;
BEGIN
  FOR _rec IN SELECT p.user_id, p.prenom FROM public.profiles p
    WHERE NOT EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.user_id = p.user_id AND m.role = 'owner')
  LOOP
    INSERT INTO public.workspaces (name, created_by) VALUES (COALESCE(_rec.prenom,'Mon espace'), _rec.user_id) RETURNING id INTO _ws_id;
    INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES (_ws_id, _rec.user_id, 'owner');
    _count := _count + 1;
  END LOOP;
  RAISE NOTICE 'Backfill : % espace(s) recréé(s).', _count;
END; $backfill$;