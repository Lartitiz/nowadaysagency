-- G2 — Retrait récupérable des photos de bibliothèque.
-- Les objets Storage et la ligne restent disponibles aux contenus existants.
ALTER TABLE public.user_photos
  ADD COLUMN IF NOT EXISTS removed_from_library_at timestamptz;

COMMENT ON COLUMN public.user_photos.removed_from_library_at IS
  'Retrait logique et réversible de la bibliothèque. Ne signifie pas que les objets Storage peuvent être détruits.';

CREATE INDEX IF NOT EXISTS idx_user_photos_visible_workspace
  ON public.user_photos(workspace_id, created_at DESC)
  WHERE removed_from_library_at IS NULL;

-- Les lectures restent accessibles aux membres afin que calendriers,
-- préparations et créations puissent encore résoudre un média retiré.
-- Les écritures sont réservées aux rôles qui peuvent réellement modifier
-- l'espace ; un viewer ne doit pas pouvoir masquer ou restaurer une photo.
DROP POLICY IF EXISTS user_photos_write_role ON public.user_photos;
CREATE POLICY user_photos_write_role ON public.user_photos
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_workspace_role(workspace_id) IN ('owner', 'manager', 'editor'))
  WITH CHECK (public.user_workspace_role(workspace_id) IN ('owner', 'manager', 'editor'));

DROP POLICY IF EXISTS user_photos_insert_role ON public.user_photos;
CREATE POLICY user_photos_insert_role ON public.user_photos
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_workspace_role(workspace_id) IN ('owner', 'manager', 'editor'));

-- La destruction physique n'est plus un droit client implicite. Un éventuel
-- purgeur serveur devra utiliser service_role, un délai de rétention et vérifier
-- à nouveau toutes les références avant de retirer les objets.
DROP POLICY IF EXISTS workspace_delete_user_photos ON public.user_photos;
DROP POLICY IF EXISTS user_photos_no_client_delete ON public.user_photos;
CREATE POLICY user_photos_no_client_delete ON public.user_photos
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (false);

-- Protège aussi la courte fenêtre entre migration SQL et publication du nouveau
-- frontend : l'ancien helper tentait Storage avant la base et ignorait l'erreur.
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can delete own photos" ON storage.objects';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_photo_library_visibility(
  p_photo_id uuid,
  p_removed boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor uuid := auth.uid();
  target_workspace uuid;
  actor_role text;
  changed_at timestamptz;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_photo_id IS NULL OR p_removed IS NULL THEN
    RAISE EXCEPTION 'Invalid photo visibility request' USING ERRCODE = '22023';
  END IF;

  SELECT workspace_id INTO target_workspace
  FROM public.user_photos
  WHERE id = p_photo_id
  FOR UPDATE;

  IF target_workspace IS NULL THEN
    RAISE EXCEPTION 'Photo not found or forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO actor_role
  FROM public.workspace_members
  WHERE workspace_id = target_workspace AND user_id = actor;

  IF actor_role IS NULL OR actor_role NOT IN ('owner', 'manager', 'editor') THEN
    RAISE EXCEPTION 'Photo not found or forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.user_photos
  SET removed_from_library_at = CASE WHEN p_removed THEN clock_timestamp() ELSE NULL END
  WHERE id = p_photo_id
  RETURNING removed_from_library_at INTO changed_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Photo not found or forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'photo_id', p_photo_id,
    'workspace_id', target_workspace,
    'removed', p_removed,
    'removed_from_library_at', changed_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_photo_library_visibility(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_photo_library_visibility(uuid, boolean) TO authenticated;
