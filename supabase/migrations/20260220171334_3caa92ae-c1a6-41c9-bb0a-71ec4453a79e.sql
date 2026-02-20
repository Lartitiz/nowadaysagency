
-- Add canal column to calendar_posts
ALTER TABLE public.calendar_posts ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'instagram';

-- Add canal column to saved_ideas
ALTER TABLE public.saved_ideas ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'instagram';
