-- Each saved composition is recoverable, including its editable text and background.
CREATE TABLE public.visual_studio_compositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.visual_studio_sessions(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  design jsonb NOT NULL CHECK (jsonb_typeof(design) = 'object' AND octet_length(design::text) < 420000),
  background_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX visual_studio_compositions_session
  ON public.visual_studio_compositions(session_id, created_at DESC);
ALTER TABLE public.visual_studio_compositions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.visual_studio_compositions FROM anon, authenticated;
GRANT SELECT ON public.visual_studio_compositions TO authenticated;
GRANT ALL ON public.visual_studio_compositions TO service_role;
CREATE POLICY studio_composition_read ON public.visual_studio_compositions
  FOR SELECT TO authenticated
  USING (public.user_has_workspace_access(workspace_id));

-- Include the current composition of sessions created before this migration.
INSERT INTO public.visual_studio_compositions
  (session_id, workspace_id, user_id, design, background_path, created_at)
SELECT id, workspace_id, user_id, composition->'design',
  composition->>'background_path', updated_at
FROM public.visual_studio_sessions
WHERE composition IS NOT NULL AND jsonb_typeof(composition->'design') = 'object';

CREATE FUNCTION public.studio_save_composition(
  p_actor uuid, p_workspace uuid, p_session uuid, p_revision integer,
  p_design jsonb, p_background_path text
) RETURNS public.visual_studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.visual_studio_sessions;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = p_actor AND workspace_id = p_workspace
      AND role IN ('owner', 'manager', 'editor')
  ) THEN RAISE EXCEPTION 'studio_forbidden'; END IF;
  IF jsonb_typeof(p_design) IS DISTINCT FROM 'object'
     OR octet_length(p_design::text) >= 420000
  THEN RAISE EXCEPTION 'studio_invalid_composition'; END IF;
  SELECT * INTO s FROM public.visual_studio_sessions
    WHERE id = p_session AND workspace_id = p_workspace FOR UPDATE;
  IF NOT FOUND OR s.revision IS DISTINCT FROM p_revision OR s.archived_at IS NOT NULL
  THEN RAISE EXCEPTION 'studio_conflict'; END IF;
  INSERT INTO public.visual_studio_compositions
    (session_id, workspace_id, user_id, design, background_path)
  VALUES (p_session, p_workspace, p_actor, p_design, p_background_path);
  UPDATE public.visual_studio_sessions SET
    composition = jsonb_build_object('design', p_design, 'background_path', p_background_path),
    revision = revision + 1, updated_at = now()
  WHERE id = p_session RETURNING * INTO s;
  RETURN s;
END $$;
REVOKE ALL ON FUNCTION public.studio_save_composition(uuid,uuid,uuid,integer,jsonb,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_save_composition(uuid,uuid,uuid,integer,jsonb,text)
  TO service_role;
