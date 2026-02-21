
-- Add content analysis columns to instagram_audit
ALTER TABLE public.instagram_audit
  ADD COLUMN IF NOT EXISTS content_analysis jsonb,
  ADD COLUMN IF NOT EXISTS content_dna jsonb,
  ADD COLUMN IF NOT EXISTS combo_gagnant text,
  ADD COLUMN IF NOT EXISTS editorial_recommendations jsonb;

-- Add content_insights to instagram_editorial_line
ALTER TABLE public.instagram_editorial_line
  ADD COLUMN IF NOT EXISTS content_insights jsonb;

-- Table for individually analyzed posts
CREATE TABLE public.instagram_audit_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid REFERENCES public.instagram_audit(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  screenshot_url text,
  format text,
  subject text,
  performance text NOT NULL DEFAULT 'top',
  likes integer,
  saves integer,
  shares integer,
  comments integer,
  reach integer,
  user_explanation text,
  ai_analysis text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_audit_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audit posts"
  ON public.instagram_audit_posts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own audit posts"
  ON public.instagram_audit_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own audit posts"
  ON public.instagram_audit_posts FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_instagram_audit_posts_audit ON public.instagram_audit_posts(audit_id);
CREATE INDEX idx_instagram_audit_posts_user ON public.instagram_audit_posts(user_id);
