-- Run only against an EMPTY disposable database. No customer fixtures.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;

CREATE TABLE public.workspaces(id uuid PRIMARY KEY);
CREATE TABLE public.workspace_members(workspace_id uuid, user_id uuid, role text);
CREATE FUNCTION public.user_has_workspace_access(ws_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=ws_id AND user_id=auth.uid())
$$;
CREATE FUNCTION public.user_workspace_role(ws_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT role FROM workspace_members WHERE workspace_id=ws_id AND user_id=auth.uid() LIMIT 1
$$;

CREATE TABLE public.user_photos(
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  storage_path text NOT NULL,
  original_storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_select_user_photos ON public.user_photos
  FOR SELECT TO authenticated USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY workspace_insert_user_photos ON public.user_photos
  FOR INSERT TO authenticated WITH CHECK (public.user_has_workspace_access(workspace_id));
CREATE POLICY workspace_update_user_photos ON public.user_photos
  FOR UPDATE TO authenticated USING (public.user_has_workspace_access(workspace_id))
  WITH CHECK (public.user_has_workspace_access(workspace_id));
CREATE POLICY workspace_delete_user_photos ON public.user_photos
  FOR DELETE TO authenticated USING (public.user_has_workspace_access(workspace_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_photos TO authenticated;

CREATE TABLE public.calendar_posts(
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  content_draft text,
  media_urls text[],
  story_sequence_detail jsonb
);
CREATE TABLE public.photo_workflows(
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  data jsonb NOT NULL
);

INSERT INTO workspaces VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO workspace_members VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','manager'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','viewer'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','44444444-4444-4444-8444-444444444444','owner');
INSERT INTO user_photos VALUES(
  'aaaaaaaa-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111/final.jpg',
  '11111111-1111-4111-8111-111111111111/original.jpg',
  now()
);
INSERT INTO calendar_posts VALUES(
  'aaaaaaaa-0000-4000-8000-000000000002',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Texte conservé',
  ARRAY['https://assets.example.test/11111111-1111-4111-8111-111111111111/final.jpg'],
  '{"type":"photo_composition","source_photo_ids":["aaaaaaaa-0000-4000-8000-000000000001"]}'
);
INSERT INTO photo_workflows VALUES(
  'aaaaaaaa-0000-4000-8000-000000000003',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '{"sources":[{"photoId":"aaaaaaaa-0000-4000-8000-000000000001"}]}'
);

CREATE TEMP TABLE before_calendar AS SELECT * FROM calendar_posts;
CREATE TEMP TABLE before_workflows AS SELECT * FROM photo_workflows;
CREATE TEMP TABLE before_photo AS SELECT * FROM user_photos;

\ir ../migrations/20260915130000_safe_photo_library_removal.sql

DO $$ BEGIN
  IF EXISTS(
    SELECT * FROM before_photo
    EXCEPT
    SELECT id,user_id,workspace_id,storage_path,original_storage_path,created_at FROM user_photos
  ) THEN RAISE EXCEPTION 'migration changed existing photo data'; END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('test.uid','11111111-1111-4111-8111-111111111111',true);
SELECT public.set_photo_library_visibility('aaaaaaaa-0000-4000-8000-000000000001', true);
DO $$ BEGIN
  IF (SELECT removed_from_library_at IS NULL FROM user_photos WHERE id='aaaaaaaa-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'photo still visible';
  END IF;
  IF EXISTS(SELECT * FROM before_calendar EXCEPT SELECT * FROM calendar_posts)
     OR EXISTS(SELECT * FROM before_workflows EXCEPT SELECT * FROM photo_workflows) THEN
    RAISE EXCEPTION 'existing content changed';
  END IF;
  BEGIN
    DELETE FROM user_photos WHERE id='aaaaaaaa-0000-4000-8000-000000000001';
    IF FOUND THEN RAISE EXCEPTION 'direct physical delete allowed'; END IF;
  END;
END $$;

-- Lost response/retry is idempotent, and a manager can restore.
SELECT public.set_photo_library_visibility('aaaaaaaa-0000-4000-8000-000000000001', true);
SELECT set_config('test.uid','22222222-2222-4222-8222-222222222222',true);
SELECT public.set_photo_library_visibility('aaaaaaaa-0000-4000-8000-000000000001', false);
DO $$ BEGIN
  IF (SELECT removed_from_library_at IS NOT NULL FROM user_photos WHERE id='aaaaaaaa-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'photo not restored';
  END IF;
END $$;

-- Viewer and outsider receive the same refusal; neither changes the row.
SELECT set_config('test.uid','33333333-3333-4333-8333-333333333333',true);
DO $$ BEGIN
  BEGIN
    PERFORM public.set_photo_library_visibility('aaaaaaaa-0000-4000-8000-000000000001', true);
    RAISE EXCEPTION 'viewer removal allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('test.uid','44444444-4444-4444-8444-444444444444',true);
DO $$ BEGIN
  BEGIN
    PERFORM public.set_photo_library_visibility('aaaaaaaa-0000-4000-8000-000000000001', true);
    RAISE EXCEPTION 'cross-workspace removal allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM user_photos WHERE id='aaaaaaaa-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'tracking row destroyed';
  END IF;
  IF EXISTS(SELECT * FROM before_calendar EXCEPT SELECT * FROM calendar_posts)
     OR EXISTS(SELECT * FROM before_workflows EXCEPT SELECT * FROM photo_workflows) THEN
    RAISE EXCEPTION 'content references changed after retries';
  END IF;
END $$;
ROLLBACK;
