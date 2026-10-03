-- « Mes styles » de l'éditeur de carrousel : un style de titre, de cadre, de
-- photo ou de voile enregistré une fois, réappliqué d'un clic dans les
-- carrousels suivants. Partagé par l'espace de travail (mode Binôme compris).
CREATE TABLE IF NOT EXISTS public.carousel_styles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  kind text NOT NULL CHECK (kind IN ('text', 'shape', 'photo', 'veil')),
  styles jsonb NOT NULL CHECK (jsonb_typeof(styles) = 'object' AND octet_length(styles::text) < 20000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS carousel_styles_workspace ON public.carousel_styles(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS carousel_styles_user ON public.carousel_styles(user_id, created_at DESC);
ALTER TABLE public.carousel_styles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.carousel_styles FROM anon;
GRANT SELECT, INSERT, DELETE ON public.carousel_styles TO authenticated;
GRANT ALL ON public.carousel_styles TO service_role;

-- Lecture : l'espace de travail, ou ses propres styles hors espace.
CREATE POLICY carousel_styles_read ON public.carousel_styles FOR SELECT TO authenticated
  USING (
    (workspace_id IS NOT NULL AND public.user_has_workspace_access(workspace_id))
    OR (workspace_id IS NULL AND user_id = auth.uid())
  );
-- Ajout : toujours à son nom, dans un espace accessible.
CREATE POLICY carousel_styles_insert ON public.carousel_styles FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (workspace_id IS NULL OR public.user_has_workspace_access(workspace_id))
  );
-- Suppression : dans un espace accessible, ou ses propres styles hors espace.
CREATE POLICY carousel_styles_delete ON public.carousel_styles FOR DELETE TO authenticated
  USING (
    (workspace_id IS NOT NULL AND public.user_has_workspace_access(workspace_id))
    OR (workspace_id IS NULL AND user_id = auth.uid())
  );
