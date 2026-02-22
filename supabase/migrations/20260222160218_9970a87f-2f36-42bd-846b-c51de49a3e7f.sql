
-- Add Instagram profile fields for text-based audit input
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS instagram_display_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS instagram_username TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS instagram_bio TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS instagram_bio_link TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS instagram_photo_description TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS instagram_photo_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS instagram_highlights JSONB;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS instagram_highlights_count INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS instagram_pinned_posts JSONB;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS instagram_feed_description TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS instagram_feed_screenshot_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS instagram_followers INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS instagram_posts_per_month INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS instagram_frequency TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS instagram_pillars JSONB;
