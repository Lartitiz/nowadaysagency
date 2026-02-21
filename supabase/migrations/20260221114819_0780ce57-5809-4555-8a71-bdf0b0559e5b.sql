ALTER TABLE public.instagram_audit ADD COLUMN IF NOT EXISTS profile_url TEXT;
ALTER TABLE public.instagram_audit ADD COLUMN IF NOT EXISTS successful_content_notes TEXT;
ALTER TABLE public.instagram_audit ADD COLUMN IF NOT EXISTS unsuccessful_content_notes TEXT;