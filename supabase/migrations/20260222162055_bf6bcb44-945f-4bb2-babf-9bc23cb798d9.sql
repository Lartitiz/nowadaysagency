
-- Storage bucket for audit post screenshots
INSERT INTO storage.buckets (id, name, public) VALUES ('audit-posts', 'audit-posts', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for audit-posts bucket
CREATE POLICY "Users can upload audit posts" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'audit-posts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view audit posts" ON storage.objects FOR SELECT
USING (bucket_id = 'audit-posts');

CREATE POLICY "Users can delete own audit posts" ON storage.objects FOR DELETE
USING (bucket_id = 'audit-posts' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add post analysis columns to instagram_audit
ALTER TABLE instagram_audit ADD COLUMN IF NOT EXISTS best_posts JSONB;
ALTER TABLE instagram_audit ADD COLUMN IF NOT EXISTS worst_posts JSONB;
ALTER TABLE instagram_audit ADD COLUMN IF NOT EXISTS best_posts_comment TEXT;
ALTER TABLE instagram_audit ADD COLUMN IF NOT EXISTS worst_posts_comment TEXT;
ALTER TABLE instagram_audit ADD COLUMN IF NOT EXISTS posts_analysis JSONB;
