-- Archive a Studio conversation without deleting versions, source files, or library images.
ALTER TABLE public.visual_studio_sessions ADD COLUMN archived_at timestamptz;
CREATE INDEX visual_studio_sessions_active ON public.visual_studio_sessions(workspace_id,updated_at DESC)
  WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.studio_set_session_archived(
  p_workspace uuid, p_session uuid, p_revision integer, p_archive boolean
) RETURNS public.visual_studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.visual_studio_sessions;
BEGIN
  SELECT * INTO s FROM public.visual_studio_sessions
    WHERE id=p_session AND workspace_id=p_workspace FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'studio_conflict'; END IF;
  IF s.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'studio_conflict'; END IF;
  IF p_archive AND EXISTS (
    SELECT 1 FROM public.visual_studio_versions
    WHERE session_id=p_session AND status='processing'
  ) THEN RAISE EXCEPTION 'studio_busy'; END IF;
  IF (s.archived_at IS NOT NULL)=p_archive THEN RETURN s; END IF;
  UPDATE public.visual_studio_sessions SET
    archived_at=CASE WHEN p_archive THEN now() ELSE NULL END,
    proposal=CASE WHEN p_archive THEN NULL ELSE proposal END,
    revision=revision+1, updated_at=now()
  WHERE id=p_session RETURNING * INTO s;
  RETURN s;
END $$;
REVOKE ALL ON FUNCTION public.studio_set_session_archived(uuid,uuid,integer,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.studio_set_session_archived(uuid,uuid,integer,boolean)
  TO service_role;
