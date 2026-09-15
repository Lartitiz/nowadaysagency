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
 series_id uuid,episode_number int,stories_timing jsonb, stories_structure text, stories_objective text, generated_content_id uuid, generated_content_type text,
 auto_publish boolean NOT NULL DEFAULT false, scheduled_publish_at timestamptz, publish_status text,
 publish_error text, published_post_id text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.content_briefs(id uuid PRIMARY KEY,user_id uuid,calendar_post_id uuid REFERENCES calendar_posts(id));
CREATE TABLE public.saved_ideas(id uuid PRIMARY KEY,user_id uuid,workspace_id uuid,series_id uuid,episode_number int,calendar_post_id uuid REFERENCES calendar_posts(id),status text,planned_date date,updated_at timestamptz DEFAULT now());
ALTER TABLE calendar_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_ideas ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_posts ON calendar_posts TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY own_briefs ON content_briefs TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY own_ideas ON saved_ideas TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES ON calendar_posts,content_briefs,saved_ideas TO authenticated,anon;
\ir ../migrations/20260912110000_atomic_calendar_save.sql
\ir ../migrations/20260915160000_idea_calendar_transfers.sql

CREATE TABLE test_members(user_id uuid PRIMARY KEY, role text);
GRANT SELECT ON test_members TO authenticated;
INSERT INTO test_members VALUES
 ('11111111-1111-4111-8111-111111111111','owner'),
 ('22222222-2222-4222-8222-222222222222','manager'),
 ('33333333-3333-4333-8333-333333333333','editor'),
 ('44444444-4444-4444-8444-444444444444','viewer');
DROP POLICY own_posts ON calendar_posts;
DROP POLICY own_ideas ON saved_ideas;
CREATE POLICY read_posts ON calendar_posts FOR SELECT TO authenticated USING(
 (workspace_id IS NULL AND user_id=auth.uid()) OR (workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND EXISTS(SELECT 1 FROM test_members WHERE user_id=auth.uid())));
CREATE POLICY write_posts ON calendar_posts FOR ALL TO authenticated USING(
 (workspace_id IS NULL AND user_id=auth.uid()) OR (workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND EXISTS(SELECT 1 FROM test_members WHERE user_id=auth.uid() AND role<>'viewer')))
 WITH CHECK((workspace_id IS NULL AND user_id=auth.uid()) OR (workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND EXISTS(SELECT 1 FROM test_members WHERE user_id=auth.uid() AND role<>'viewer')));
CREATE POLICY read_ideas ON saved_ideas FOR SELECT TO authenticated USING(
 (workspace_id IS NULL AND user_id=auth.uid()) OR (workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND EXISTS(SELECT 1 FROM test_members WHERE user_id=auth.uid())));
CREATE POLICY write_ideas ON saved_ideas FOR ALL TO authenticated USING(
 (workspace_id IS NULL AND user_id=auth.uid()) OR (workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND EXISTS(SELECT 1 FROM test_members WHERE user_id=auth.uid() AND role<>'viewer')))
 WITH CHECK((workspace_id IS NULL AND user_id=auth.uid()) OR (workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND EXISTS(SELECT 1 FROM test_members WHERE user_id=auth.uid() AND role<>'viewer')));
INSERT INTO saved_ideas(id,user_id,workspace_id,series_id,episode_number) VALUES
 ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',2);
CREATE FUNCTION reject_test_link() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF current_setting('test.fail_link',true)='true' THEN RAISE EXCEPTION 'injected_link_failure'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER test_link_failure BEFORE UPDATE ON saved_ideas FOR EACH ROW EXECUTE FUNCTION reject_test_link();
SET ROLE authenticated;
SELECT set_config('test.uid','11111111-1111-4111-8111-111111111111',false);
DO $$
DECLARE idea_id uuid := '55555555-5555-4555-8555-555555555555'; version timestamptz;
 payload jsonb := '{"theme":"R3","canal":"instagram","status":"idea","content_draft":"<p>Texte riche</p>","story_sequence_detail":{"slides":[{"id":"s2"},{"id":"s1"}],"_crosspost":{"source":"private"},"variants":["v1"]},"media_urls":["https://example.test/2.png","https://example.test/1.png"],"stories_timing":{"time":"08:30"},"auto_publish":true,"scheduled_publish_at":"2040-01-01T12:00:00Z"}';
 receipt jsonb; again jsonb; post_id uuid; rejected boolean; timestamp_before timestamptz;
BEGIN
 SELECT updated_at INTO version FROM saved_ideas WHERE id=idea_id;
 PERFORM set_config('test.fail_link','true',false);
 rejected := false;
 BEGIN PERFORM plan_saved_idea(idea_id,'2026-10-25',payload,version);
 EXCEPTION WHEN OTHERS THEN rejected := SQLERRM='injected_link_failure'; END;
 IF NOT rejected OR EXISTS(SELECT 1 FROM calendar_posts) THEN RAISE EXCEPTION 'FAIL partial plan'; END IF;
 PERFORM set_config('test.fail_link','false',false);
 rejected:=false;
 BEGIN PERFORM plan_saved_idea(idea_id,'2026-10-25',payload,version-interval '1 second'); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM='calendar_version_conflict'; END;
 IF NOT rejected OR EXISTS(SELECT 1 FROM calendar_posts) THEN RAISE EXCEPTION 'FAIL stale source'; END IF;
 receipt:=plan_saved_idea(idea_id,'2026-10-25',payload,version); post_id:=(receipt->>'id')::uuid;
 IF (SELECT calendar_post_id FROM saved_ideas WHERE id=idea_id) IS DISTINCT FROM post_id THEN RAISE EXCEPTION 'FAIL link'; END IF;
 IF (SELECT row(status,auto_publish,scheduled_publish_at,episode_number)::text FROM calendar_posts WHERE id=post_id) IS DISTINCT FROM '(idea,f,,2)' THEN RAISE EXCEPTION 'FAIL scheduling or series'; END IF;
 IF (SELECT story_sequence_detail FROM calendar_posts WHERE id=post_id) IS DISTINCT FROM payload->'story_sequence_detail' THEN RAISE EXCEPTION 'FAIL rich content'; END IF;
 IF (SELECT stories_timing FROM calendar_posts WHERE id=post_id) IS DISTINCT FROM payload->'stories_timing' THEN RAISE EXCEPTION 'FAIL timing'; END IF;
 UPDATE calendar_posts SET content_draft='Edited independently' WHERE id=post_id;
 again:=plan_saved_idea(idea_id,'2027-03-28',payload,version);
 IF again->>'id'<>receipt->>'id' OR again->>'date'<>'2026-10-25' OR again->>'replayed'<>'true' OR (SELECT count(*) FROM calendar_posts)<>1 OR (SELECT content_draft FROM calendar_posts WHERE id=post_id)<>'Edited independently' THEN RAISE EXCEPTION 'FAIL replay'; END IF;
 UPDATE calendar_posts SET auto_publish=true,publish_status='scheduled',scheduled_publish_at='2040-01-01T12:00:00Z' WHERE id=post_id;
 SELECT scheduled_publish_at INTO timestamp_before FROM calendar_posts WHERE id=post_id;
 PERFORM move_calendar_post(post_id,'2027-03-28','2026-10-25');
 IF (SELECT planned_date FROM saved_ideas WHERE id=idea_id)<>'2027-03-28' OR (SELECT scheduled_publish_at FROM calendar_posts WHERE id=post_id) IS DISTINCT FROM timestamp_before THEN RAISE EXCEPTION 'FAIL editorial date vs social time'; END IF;
 rejected:=false;
 BEGIN PERFORM move_calendar_post(post_id,'2026-09-15','2026-10-25'); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM='calendar_version_conflict'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL stale undo'; END IF;
 PERFORM set_config('test.fail_link','true',false); rejected:=false;
 BEGIN PERFORM move_calendar_post(post_id,'2026-10-25','2027-03-28'); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM='injected_link_failure'; END;
 IF NOT rejected OR (SELECT date FROM calendar_posts WHERE id=post_id)<>'2027-03-28' THEN RAISE EXCEPTION 'FAIL partial move'; END IF;
 PERFORM set_config('test.fail_link','false',false);
END $$;
-- Managers/editors may move; viewer and nonmember cannot mutate or obtain a successful replay.
DO $$ DECLARE u uuid; post_id uuid; rejected boolean; receipt jsonb; BEGIN
 SELECT id INTO post_id FROM calendar_posts LIMIT 1;
 FOREACH u IN ARRAY ARRAY['22222222-2222-4222-8222-222222222222'::uuid,'33333333-3333-4333-8333-333333333333'::uuid] LOOP
  PERFORM set_config('test.uid',u::text,false);
  PERFORM move_calendar_post(post_id,'2027-03-28','2027-03-28');
  receipt:=plan_saved_idea('55555555-5555-4555-8555-555555555555','2027-03-28','{}',NULL);
  IF receipt->>'replayed'<>'true' THEN RAISE EXCEPTION 'FAIL member replay'; END IF;
  INSERT INTO saved_ideas(id,user_id,workspace_id) VALUES(u,'11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  receipt:=plan_saved_idea(u,'2026-10-25','{"theme":"R3 member","canal":"instagram","workspace_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}',(SELECT updated_at FROM saved_ideas WHERE id=u));
  IF (SELECT workspace_id FROM calendar_posts WHERE id=(receipt->>'id')::uuid)<>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' THEN RAISE EXCEPTION 'FAIL supplied workspace override'; END IF;

 END LOOP;
 FOREACH u IN ARRAY ARRAY['44444444-4444-4444-8444-444444444444'::uuid,'99999999-9999-4999-8999-999999999999'::uuid] LOOP
  PERFORM set_config('test.uid',u::text,false); rejected:=false;
  BEGIN PERFORM move_calendar_post(post_id,'2026-10-25','2027-03-28'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'FAIL read-only move'; END IF;
  rejected:=false;
  BEGIN PERFORM plan_saved_idea('55555555-5555-4555-8555-555555555555','2026-10-25','{}',NULL); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'FAIL read-only replay'; END IF;
 END LOOP;
 PERFORM set_config('test.uid','',false); rejected:=false;
 BEGIN PERFORM move_calendar_post(post_id,'2026-10-25','2027-03-28'); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM='calendar_auth_required'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL no identity'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_function_privilege('anon','plan_saved_idea(uuid,date,jsonb,timestamptz)','EXECUTE') OR has_function_privilege('anon','move_calendar_post(uuid,date,date)','EXECUTE') THEN RAISE EXCEPTION 'FAIL anon grants'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE proname IN ('plan_saved_idea','move_calendar_post') AND prosecdef) THEN RAISE EXCEPTION 'FAIL definer'; END IF;
END $$;
ROLLBACK;
