-- Add stories-specific columns to calendar_posts
ALTER TABLE public.calendar_posts
  ADD COLUMN IF NOT EXISTS stories_count integer,
  ADD COLUMN IF NOT EXISTS stories_objective text,
  ADD COLUMN IF NOT EXISTS stories_structure text,
  ADD COLUMN IF NOT EXISTS stories_sequence_id uuid REFERENCES public.stories_sequences(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stories_timing jsonb,
  ADD COLUMN IF NOT EXISTS amplification_stories jsonb;

CREATE INDEX IF NOT EXISTS idx_calendar_posts_stories_seq ON public.calendar_posts(stories_sequence_id) WHERE stories_sequence_id IS NOT NULL;