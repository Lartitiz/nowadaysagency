ALTER TABLE content_briefs ADD COLUMN IF NOT EXISTS calendar_post_id UUID;
CREATE INDEX IF NOT EXISTS idx_content_briefs_calendar ON content_briefs(calendar_post_id);