ALTER TABLE public.calendar_posts
  ADD COLUMN IF NOT EXISTS scheduled_publish_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_publish boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS publish_status text,
  ADD COLUMN IF NOT EXISTS published_post_id text,
  ADD COLUMN IF NOT EXISTS publish_error text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_calendar_posts_due_publish
  ON public.calendar_posts (scheduled_publish_at)
  WHERE auto_publish = true AND publish_status = 'scheduled';