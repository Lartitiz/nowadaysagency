
-- Table 1: calendar_shares
CREATE TABLE public.calendar_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id),
  share_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'base64'),
  label text,
  guest_name text,
  canal_filter text DEFAULT 'all',
  show_content_draft boolean DEFAULT false,
  expires_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.calendar_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own shares"
  ON public.calendar_shares FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Table 2: calendar_comments
CREATE TABLE public.calendar_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_post_id uuid NOT NULL REFERENCES public.calendar_posts(id) ON DELETE CASCADE,
  share_id uuid NOT NULL REFERENCES public.calendar_shares(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  author_role text NOT NULL DEFAULT 'guest',
  content text NOT NULL,
  is_resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.calendar_comments ENABLE ROW LEVEL SECURITY;

-- SELECT: owner of the share
CREATE POLICY "Owner can select comments"
  ON public.calendar_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.calendar_shares cs
      WHERE cs.id = share_id AND cs.user_id = auth.uid()
    )
  );

-- INSERT: owner of the share (guest inserts go through service_role edge function)
CREATE POLICY "Owner can insert comments"
  ON public.calendar_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.calendar_shares cs
      WHERE cs.id = share_id AND cs.user_id = auth.uid()
    )
  );

-- UPDATE: only owner, only is_resolved
CREATE POLICY "Owner can update comments"
  ON public.calendar_comments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.calendar_shares cs
      WHERE cs.id = share_id AND cs.user_id = auth.uid()
    )
  );

-- DELETE: only owner
CREATE POLICY "Owner can delete comments"
  ON public.calendar_comments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.calendar_shares cs
      WHERE cs.id = share_id AND cs.user_id = auth.uid()
    )
  );
