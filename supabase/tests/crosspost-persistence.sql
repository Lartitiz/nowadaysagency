-- Integration fixture. Run only in an EMPTY disposable PostgreSQL database.
\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
CREATE TABLE public.calendar_posts (
 id uuid PRIMARY KEY, user_id uuid NOT NULL, workspace_id uuid, date date NOT NULL, theme text NOT NULL,
 canal text NOT NULL, status text NOT NULL, format text, objectif text, angle text, content_draft text,
 accroche text, notes text, story_sequence_detail jsonb, media_urls text[], stories_count int,
 stories_structure text, stories_objective text, generated_content_id uuid, generated_content_type text,
 auto_publish boolean NOT NULL DEFAULT false, scheduled_publish_at timestamptz, publish_status text,
 publish_error text, published_post_id text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.content_briefs(id uuid PRIMARY KEY,user_id uuid,calendar_post_id uuid REFERENCES calendar_posts(id));
CREATE TABLE public.saved_ideas(id uuid PRIMARY KEY,user_id uuid,calendar_post_id uuid REFERENCES calendar_posts(id),status text,planned_date date,updated_at timestamptz);
ALTER TABLE calendar_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_ideas ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_posts ON calendar_posts TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY own_briefs ON content_briefs TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY own_ideas ON saved_ideas TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES ON calendar_posts,content_briefs,saved_ideas TO authenticated,anon;
ALTER TABLE saved_ideas ADD workspace_id uuid, ADD source_module text;
CREATE TABLE workspace_members(workspace_id uuid,user_id uuid,role text);
GRANT SELECT ON workspace_members TO authenticated;
CREATE FUNCTION user_has_workspace_access(ws uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=ws AND user_id=auth.uid()) $$;
CREATE POLICY workspace_posts ON calendar_posts TO authenticated USING(user_has_workspace_access(workspace_id)) WITH CHECK(user_has_workspace_access(workspace_id));
CREATE POLICY workspace_ideas ON saved_ideas TO authenticated USING(user_has_workspace_access(workspace_id)) WITH CHECK(user_has_workspace_access(workspace_id));
CREATE POLICY tenant_immovable ON calendar_posts AS RESTRICTIVE FOR ALL TO authenticated WITH CHECK(workspace_id IS NULL OR user_has_workspace_access(workspace_id));
CREATE POLICY tenant_immovable ON saved_ideas AS RESTRICTIVE FOR ALL TO authenticated WITH CHECK(workspace_id IS NULL OR user_has_workspace_access(workspace_id));
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean);
CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
INSERT INTO workspace_members VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','manager'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','viewer'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','editor');
\ir ../migrations/20260912110000_atomic_calendar_save.sql
SET ROLE authenticated;
SELECT set_config('test.uid','22222222-2222-4222-8222-222222222222',false);
SELECT save_calendar_content('aaaaaaaa-0000-4000-8000-000000000001','{"workspace_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","date":"2040-01-01","theme":"Legacy","canal":"instagram"}',true);
DO $$ BEGIN
IF (SELECT user_id FROM calendar_posts LIMIT 1) <> auth.uid() THEN RAISE EXCEPTION 'baseline reproduction failed'; END IF;
END $$;
RESET ROLE;
CREATE TEMP TABLE history AS SELECT * FROM calendar_posts;
\ir ../migrations/20260914154500_crosspost_persistence.sql
DO $$ BEGIN
IF EXISTS((SELECT * FROM history) EXCEPT (SELECT * FROM calendar_posts)) THEN RAISE EXCEPTION 'history changed'; END IF;
END $$;
SET ROLE authenticated;
DO $$ DECLARE receipt jsonb; again jsonb; rejected boolean := false; version timestamptz;
BEGIN
receipt := save_calendar_content('aaaaaaaa-0000-4000-8000-000000000002','{"workspace_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","date":"2040-01-01","theme":"New","canal":"instagram","story_sequence_detail":{"_crosspost":{"result":{"versions":{"reel":{"script":"intégral"}}}}}}',true);
IF (SELECT user_id FROM calendar_posts WHERE id='aaaaaaaa-0000-4000-8000-000000000002') <> '11111111-1111-4111-8111-111111111111' THEN RAISE EXCEPTION 'wrong owner'; END IF;
again := save_calendar_content('aaaaaaaa-0000-4000-8000-000000000002','{"workspace_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","content_draft":"do not overwrite"}',true);
IF again->>'replayed' <> 'true' OR (SELECT count(*) FROM calendar_posts)<>2 THEN RAISE EXCEPTION 'duplicate'; END IF;
SELECT updated_at INTO version FROM calendar_posts WHERE id='aaaaaaaa-0000-4000-8000-000000000001';
PERFORM save_calendar_content('aaaaaaaa-0000-4000-8000-000000000001','{"content_draft":"legacy edited"}',false,NULL,NULL,version);
IF (SELECT user_id FROM calendar_posts WHERE id='aaaaaaaa-0000-4000-8000-000000000001')<>auth.uid() THEN RAISE EXCEPTION 'historical owner changed'; END IF;
BEGIN PERFORM save_calendar_content('aaaaaaaa-0000-4000-8000-000000000002','{}',true);
EXCEPTION WHEN OTHERS THEN rejected := SQLSTATE='42501'; END;
IF NOT rejected THEN RAISE EXCEPTION 'wrong scope replay'; END IF;
INSERT INTO storage.objects(bucket_id,name) VALUES ('crosspost-sources','workspace/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/original.pdf');
INSERT INTO saved_ideas(id,user_id,workspace_id,source_module) VALUES('bbbbbbbb-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','crosspost');
END $$;
-- A read-only member reads both documents and sources, but cannot save, delete, or upload.
SELECT set_config('test.uid','33333333-3333-4333-8333-333333333333',false);
DO $$ DECLARE rejected boolean := false; BEGIN
IF (SELECT count(*) FROM calendar_posts) <> 2 OR (SELECT count(*) FROM storage.objects)<>1 THEN RAISE EXCEPTION 'viewer cannot read'; END IF;
BEGIN PERFORM save_calendar_content(gen_random_uuid(),'{"workspace_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","date":"2040-01-01","theme":"x","canal":"instagram"}',true);
EXCEPTION WHEN OTHERS THEN rejected := SQLSTATE='42501'; END;
IF NOT rejected THEN RAISE EXCEPTION 'viewer writes calendar'; END IF;
rejected := false;
BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES('crosspost-sources','workspace/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/no.pdf');
EXCEPTION WHEN OTHERS THEN rejected := SQLSTATE='42501'; END;
IF NOT rejected THEN RAISE EXCEPTION 'viewer uploads'; END IF;
DELETE FROM saved_ideas WHERE source_module='crosspost';
IF NOT EXISTS(SELECT 1 FROM saved_ideas) THEN RAISE EXCEPTION 'viewer deleted idea'; END IF;
rejected := false;
BEGIN INSERT INTO saved_ideas(id,user_id,workspace_id,source_module) VALUES(gen_random_uuid(),auth.uid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','crosspost');
EXCEPTION WHEN OTHERS THEN rejected := SQLSTATE='42501'; END;
IF NOT rejected THEN RAISE EXCEPTION 'viewer inserts idea'; END IF;
END $$;
-- Editor retains write rights and owner attribution.
SELECT set_config('test.uid','44444444-4444-4444-8444-444444444444',false);
SELECT save_calendar_content(gen_random_uuid(),'{"workspace_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","date":"2040-01-01","theme":"Editor","canal":"linkedin"}',true);
-- Outsider cannot read sources or insert in workspace. Personal fallback still works.
SELECT set_config('test.uid','55555555-5555-4555-8555-555555555555',false);
DO $$ DECLARE rejected boolean:=false; BEGIN
IF EXISTS(SELECT 1 FROM storage.objects) OR EXISTS(SELECT 1 FROM calendar_posts) THEN RAISE EXCEPTION 'outsider read'; END IF;
BEGIN PERFORM save_calendar_content(gen_random_uuid(),'{"workspace_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',true);
EXCEPTION WHEN OTHERS THEN rejected := SQLSTATE='42501'; END;
IF NOT rejected THEN RAISE EXCEPTION 'outsider write'; END IF;
PERFORM save_calendar_content(gen_random_uuid(),'{"date":"2040-01-01","theme":"Personal","canal":"linkedin"}',true);
IF (SELECT user_id FROM calendar_posts LIMIT 1)<>auth.uid() THEN RAISE EXCEPTION 'personal owner'; END IF;
IF crosspost_source_access('workspace/not-a-uuid/a.pdf',true) OR crosspost_source_access('other/55555555-5555-4555-8555-555555555555/a.pdf',true) THEN RAISE EXCEPTION 'bad path'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
IF has_function_privilege('anon','save_calendar_content(uuid,jsonb,boolean,uuid,uuid,timestamptz)','EXECUTE') OR (SELECT public FROM storage.buckets WHERE id='crosspost-sources') THEN RAISE EXCEPTION 'public access'; END IF;
END $$;
ROLLBACK;
