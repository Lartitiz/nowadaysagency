
-- Add new columns to prospects for DM context
ALTER TABLE public.prospects 
  ADD COLUMN IF NOT EXISTS noted_interest TEXT,
  ADD COLUMN IF NOT EXISTS to_avoid TEXT,
  ADD COLUMN IF NOT EXISTS last_conversation TEXT;
