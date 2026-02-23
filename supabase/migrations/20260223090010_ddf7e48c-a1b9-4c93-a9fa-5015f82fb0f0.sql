-- Add generated content tracking columns to calendar_posts
ALTER TABLE public.calendar_posts ADD COLUMN IF NOT EXISTS generated_content_id UUID;
ALTER TABLE public.calendar_posts ADD COLUMN IF NOT EXISTS generated_content_type TEXT;
