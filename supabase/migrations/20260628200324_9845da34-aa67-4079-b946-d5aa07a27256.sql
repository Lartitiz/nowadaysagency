ALTER TABLE public.calendar_posts ADD COLUMN IF NOT EXISTS group_id uuid;

CREATE INDEX IF NOT EXISTS idx_calendar_posts_group_id ON public.calendar_posts(group_id);