ALTER TABLE public.user_photos ADD COLUMN IF NOT EXISTS description TEXT;

CREATE TABLE IF NOT EXISTS public.photo_wishlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  label TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'seance', 'directive')),
  requested_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  satisfied_photo_id UUID REFERENCES public.user_photos(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.photo_wishlist TO authenticated;
GRANT ALL ON public.photo_wishlist TO service_role;

CREATE INDEX IF NOT EXISTS idx_photo_wishlist_workspace ON public.photo_wishlist(workspace_id, status);

ALTER TABLE public.photo_wishlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_select_photo_wishlist ON public.photo_wishlist
  FOR SELECT USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY workspace_insert_photo_wishlist ON public.photo_wishlist
  FOR INSERT WITH CHECK (public.user_has_workspace_access(workspace_id));

CREATE POLICY workspace_update_photo_wishlist ON public.photo_wishlist
  FOR UPDATE USING (public.user_has_workspace_access(workspace_id))
  WITH CHECK (public.user_has_workspace_access(workspace_id));

CREATE POLICY workspace_delete_photo_wishlist ON public.photo_wishlist
  FOR DELETE USING (public.user_has_workspace_access(workspace_id));

CREATE TRIGGER update_photo_wishlist_updated_at
  BEFORE UPDATE ON public.photo_wishlist
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();