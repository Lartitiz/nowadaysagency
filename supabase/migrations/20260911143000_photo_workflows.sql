-- Saved photographic directions and resumable preparations; never stores image bytes.
CREATE TABLE public.photo_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('direction', 'preparation')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  data jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(data) = 'object' AND octet_length(data::text) <= 250000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX photo_workflows_workspace_kind ON public.photo_workflows(workspace_id, kind, updated_at DESC);
ALTER TABLE public.photo_workflows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.photo_workflows FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.photo_workflows TO authenticated;
GRANT ALL ON public.photo_workflows TO service_role;
CREATE POLICY photo_workflows_read ON public.photo_workflows FOR SELECT TO authenticated
  USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY photo_workflows_insert ON public.photo_workflows FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.user_has_workspace_access(workspace_id));
CREATE POLICY photo_workflows_update ON public.photo_workflows FOR UPDATE TO authenticated
  USING (public.user_has_workspace_access(workspace_id))
  WITH CHECK (public.user_has_workspace_access(workspace_id));
CREATE POLICY photo_workflows_delete ON public.photo_workflows FOR DELETE TO authenticated
  USING (public.user_has_workspace_access(workspace_id));

CREATE FUNCTION public.protect_photo_workflow_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.kind IS DISTINCT FROM OLD.kind THEN
    RAISE EXCEPTION 'Photo workflow ownership and scope are immutable';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_photo_workflow_scope BEFORE UPDATE ON public.photo_workflows
  FOR EACH ROW EXECUTE FUNCTION public.protect_photo_workflow_scope();
REVOKE ALL ON FUNCTION public.protect_photo_workflow_scope() FROM PUBLIC;
