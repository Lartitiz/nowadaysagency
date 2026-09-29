-- Keep imports from onboarding idempotent across refreshes and the brand review
-- and welcome screens. A removed photo remains linked to its source and is not
-- silently recreated during onboarding.
ALTER TABLE public.user_photos
  ADD COLUMN IF NOT EXISTS source_image_url text;

CREATE UNIQUE INDEX IF NOT EXISTS user_photos_workspace_source_image_url_unique
  ON public.user_photos (workspace_id, md5(source_image_url))
  WHERE source_image_url IS NOT NULL;
