-- ============================================================================
-- Plan Photo 1 — Fondations user_photos + bucket Storage
-- ============================================================================

-- 1. Table user_photos
CREATE TABLE public.user_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  original_storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  name TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  background_prompt TEXT,
  background_preset_key TEXT,
  source_type TEXT NOT NULL DEFAULT 'upload' CHECK (source_type IN ('upload', 'generated', 'imported')),
  width INTEGER,
  height INTEGER,
  file_size_bytes BIGINT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Commentaires de documentation
COMMENT ON COLUMN public.user_photos.storage_path IS 'Chemin dans le bucket user-photos de la photo retouchée (ex: {user_id}/{photo_id}.jpg)';
COMMENT ON COLUMN public.user_photos.original_storage_path IS 'Chemin de la photo originale avant retouche, préservée immuable';
COMMENT ON COLUMN public.user_photos.source_type IS 'upload = upload user, generated = générée par IA, imported = importée depuis le calendrier';
COMMENT ON COLUMN public.user_photos.background_preset_key IS 'Clé du preset de fond utilisé (ex: studio_minimal_beige, cafe_lumineux). NULL si prompt libre.';
COMMENT ON COLUMN public.user_photos.status IS 'pending = en attente d''upload, processing = en cours de retouche Photoroom, ready = disponible, failed = erreur';

-- 3. Index
CREATE INDEX idx_user_photos_workspace ON public.user_photos(workspace_id, status) WHERE status = 'ready';
CREATE INDEX idx_user_photos_user ON public.user_photos(user_id);
CREATE INDEX idx_user_photos_tags ON public.user_photos USING GIN(tags);

-- 4. Trigger updated_at
CREATE TRIGGER update_user_photos_updated_at
  BEFORE UPDATE ON public.user_photos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 5. RLS workspace-scoped
ALTER TABLE public.user_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_select_user_photos ON public.user_photos
  FOR SELECT USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY workspace_insert_user_photos ON public.user_photos
  FOR INSERT WITH CHECK (public.user_has_workspace_access(workspace_id));

CREATE POLICY workspace_update_user_photos ON public.user_photos
  FOR UPDATE USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY workspace_delete_user_photos ON public.user_photos
  FOR DELETE USING (public.user_has_workspace_access(workspace_id));

-- 6. Bucket Storage privé
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-photos', 'user-photos', false)
ON CONFLICT (id) DO NOTHING;

-- 7. Storage policies
-- INSERT : user peut uploader si le chemin commence par son user_id
CREATE POLICY "Users can upload own photos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'user-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT : user peut lire une photo si elle appartient à un workspace dont il·elle fait partie
CREATE POLICY "Users can read accessible workspace photos" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'user-photos'
    AND EXISTS (
      SELECT 1 FROM public.user_photos up
      WHERE (up.storage_path = name OR up.original_storage_path = name)
      AND public.user_has_workspace_access(up.workspace_id)
    )
  );

-- DELETE : user peut supprimer si c'est son fichier (chemin commence par son user_id)
CREATE POLICY "Users can delete own photos" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'user-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );