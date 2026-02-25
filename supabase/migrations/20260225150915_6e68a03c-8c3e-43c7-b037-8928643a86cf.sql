-- Add link columns to workspaces table
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS website_url text;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS instagram_url text;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS extra_links jsonb DEFAULT '[]'::jsonb;