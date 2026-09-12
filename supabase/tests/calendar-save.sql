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
\ir ../migrations/20260912110000_atomic_calendar_save.sql
INSERT INTO content_briefs VALUES ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',null);
INSERT INTO saved_ideas(id,user_id) VALUES ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111');
SET ROLE authenticated;
SELECT set_config('test.uid','11111111-1111-4111-8111-111111111111',false);
DO $$
DECLARE
 post_id uuid := '55555555-5555-4555-8555-555555555555';
 payload jsonb := '{"date":"2040-01-01","theme":"Fixture","canal":"instagram","content_draft":"Version A","media_urls":["https://example.test/a.jpg"]}';
 receipt jsonb; replay jsonb; rejected boolean := false; n int; version timestamptz;
BEGIN
 -- Failure of a linked row rolls back the post itself.
 BEGIN
  PERFORM save_calendar_content(post_id,payload,true,'99999999-9999-4999-8999-999999999999');
 EXCEPTION WHEN OTHERS THEN rejected := SQLERRM='calendar_brief_not_found'; END;
 IF NOT rejected OR EXISTS(SELECT 1 FROM calendar_posts WHERE id=post_id) THEN RAISE EXCEPTION 'FAIL partial insert'; END IF;
 receipt := save_calendar_content(post_id,payload,true,'33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444');
 IF (SELECT calendar_post_id FROM saved_ideas LIMIT 1) IS DISTINCT FROM post_id THEN RAISE EXCEPTION 'FAIL missing idea link'; END IF;
 IF (SELECT calendar_post_id FROM content_briefs LIMIT 1) IS DISTINCT FROM post_id THEN RAISE EXCEPTION 'FAIL missing brief link'; END IF;
 -- Replaying a lost response never inserts or overwrites a second version.
 replay := save_calendar_content(post_id,payload || '{"content_draft":"Version B"}',true);
 IF replay->>'replayed' <> 'true' OR (SELECT count(*) FROM calendar_posts)<>1 OR (SELECT content_draft FROM calendar_posts LIMIT 1)<>'Version A' THEN RAISE EXCEPTION 'FAIL replay'; END IF;
 version := (receipt->>'updated_at')::timestamptz;
 rejected := false;
 BEGIN
  PERFORM save_calendar_content(post_id,payload || '{"content_draft":"Version B"}',false,NULL,'99999999-9999-4999-8999-999999999999',version);
 EXCEPTION WHEN OTHERS THEN rejected := SQLERRM='calendar_idea_not_found'; END;
 IF NOT rejected OR (SELECT content_draft FROM calendar_posts LIMIT 1)<>'Version A' THEN RAISE EXCEPTION 'FAIL partial update'; END IF;
 receipt := save_calendar_content(post_id,payload || '{"content_draft":"Version B","user_id":"22222222-2222-4222-8222-222222222222","publish_status":"published"}',false,NULL,NULL,version);
 IF (SELECT user_id FROM calendar_posts LIMIT 1)<>auth.uid() OR (SELECT publish_status FROM calendar_posts LIMIT 1)='published' THEN RAISE EXCEPTION 'FAIL protected fields'; END IF;
 rejected := false;
 BEGIN PERFORM save_calendar_content(post_id,payload,false,NULL,NULL,version);
 EXCEPTION WHEN OTHERS THEN rejected := SQLERRM='calendar_version_conflict'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL stale edit'; END IF;
 UPDATE calendar_posts SET publish_status='publishing' WHERE id=post_id;
 rejected := false;
 BEGIN PERFORM save_calendar_content(post_id,payload,false,NULL,NULL,(receipt->>'updated_at')::timestamptz);
 EXCEPTION WHEN OTHERS THEN rejected := SQLERRM='calendar_publication_locked'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL publishing edit'; END IF;
 rejected := false;
 BEGIN PERFORM save_calendar_content('66666666-6666-4666-8666-666666666666',payload || '{"media_urls":[],"auto_publish":true,"scheduled_publish_at":"2040-01-01T10:00:00Z"}',true);
 EXCEPTION WHEN OTHERS THEN rejected := SQLERRM='calendar_media_required'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL missing media scheduled'; END IF;
 IF has_table_privilege('authenticated','calendar_posts','TRUNCATE') THEN RAISE EXCEPTION 'FAIL truncate grant'; END IF;
END $$;
SELECT set_config('test.uid','22222222-2222-4222-8222-222222222222',false);
DO $$
DECLARE rejected boolean := false;
BEGIN
 IF EXISTS(SELECT 1 FROM calendar_posts) THEN RAISE EXCEPTION 'FAIL RLS read'; END IF;
 BEGIN PERFORM save_calendar_content('55555555-5555-4555-8555-555555555555','{}',false,NULL,NULL,now());
 EXCEPTION WHEN OTHERS THEN rejected := SQLERRM='calendar_not_found'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL RLS write'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_function_privilege('anon','save_calendar_content(uuid,jsonb,boolean,uuid,uuid,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'FAIL anonymous execute'; END IF;
END $$;
ROLLBACK;
