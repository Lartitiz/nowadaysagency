
CREATE TABLE content_briefs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID,
  subject TEXT NOT NULL,
  objective TEXT,
  format TEXT,
  editorial_angle TEXT,
  questions JSONB DEFAULT '[]',
  answers JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  used_count INTEGER DEFAULT 0
);

ALTER TABLE content_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own briefs"
  ON content_briefs FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_content_briefs_user ON content_briefs(user_id);
CREATE INDEX idx_content_briefs_workspace ON content_briefs(workspace_id);
