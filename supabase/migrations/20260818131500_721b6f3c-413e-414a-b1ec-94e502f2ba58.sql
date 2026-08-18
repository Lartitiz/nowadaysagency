ALTER TABLE public.content_quality_events ADD COLUMN IF NOT EXISTS slop_signals jsonb;
