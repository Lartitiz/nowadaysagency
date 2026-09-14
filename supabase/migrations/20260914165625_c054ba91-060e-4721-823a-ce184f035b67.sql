BEGIN;
-- A durable MP4 is published at most once per Instagram account and space.
-- Service-only ledger: clients cannot manufacture success or release a lock.
CREATE TABLE public.reel_publication_receipts (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid,
  account_id text NOT NULL,
  video_url text NOT NULL,
  caption text NOT NULL,
  state text NOT NULL DEFAULT 'preparing' CHECK (state IN ('preparing','publishing','published')),
  post_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state = 'published') = (post_id IS NOT NULL))
);
ALTER TABLE public.reel_publication_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reel_publication_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.reel_publication_receipts TO service_role;
COMMENT ON TABLE public.reel_publication_receipts IS 'Never automatically expire uncertain Reel attempts: inspect Instagram before any manual recovery.';
COMMIT;