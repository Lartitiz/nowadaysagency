-- Integration fixture. Run only in an EMPTY disposable PostgreSQL database.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
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
CREATE TABLE public.saved_ideas(id uuid PRIMARY KEY,user_id uuid,workspace_id uuid,series_id uuid,episode_number int,source_module text,calendar_post_id uuid REFERENCES calendar_posts(id),status text,planned_date date,updated_at timestamptz DEFAULT now());
ALTER TABLE calendar_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_ideas ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_briefs ON content_briefs TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES ON calendar_posts,content_briefs,saved_ideas TO authenticated,anon;
CREATE TABLE workspace_members(workspace_id uuid,user_id uuid,role text,PRIMARY KEY(workspace_id,user_id));
GRANT SELECT ON workspace_members TO authenticated;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.objects(bucket_id text,name text);
-- Production policy definitions observed by R0 on 2026-09-15.
CREATE OR REPLACE FUNCTION public.user_has_workspace_access(ws_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid()
  );
END;
$function$
;
CREATE POLICY "Users can delete own calendar posts" ON calendar_posts FOR DELETE TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own calendar posts" ON calendar_posts FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own calendar posts" ON calendar_posts FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view own calendar posts" ON calendar_posts FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "tenant_immovable" ON calendar_posts AS RESTRICTIVE FOR ALL TO authenticated WITH CHECK (((workspace_id IS NULL) OR user_has_workspace_access(workspace_id)));
CREATE POLICY "workspace_delete_calendar_posts" ON calendar_posts FOR DELETE TO authenticated USING (user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_insert_calendar_posts" ON calendar_posts FOR INSERT TO authenticated WITH CHECK (user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_select_calendar_posts" ON calendar_posts FOR SELECT TO authenticated USING (user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_update_calendar_posts" ON calendar_posts FOR UPDATE TO authenticated USING (user_has_workspace_access(workspace_id));
CREATE POLICY "Users can delete own ideas" ON saved_ideas FOR DELETE TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own ideas" ON saved_ideas FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own ideas" ON saved_ideas FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view own ideas" ON saved_ideas FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "tenant_immovable" ON saved_ideas AS RESTRICTIVE FOR ALL TO authenticated WITH CHECK (((workspace_id IS NULL) OR user_has_workspace_access(workspace_id)));
CREATE POLICY "workspace_delete_saved_ideas" ON saved_ideas FOR DELETE TO authenticated USING (user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_insert_saved_ideas" ON saved_ideas FOR INSERT TO authenticated WITH CHECK (user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_select_saved_ideas" ON saved_ideas FOR SELECT TO authenticated USING (user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_update_saved_ideas" ON saved_ideas FOR UPDATE TO authenticated USING (user_has_workspace_access(workspace_id));
\ir ../migrations/20260914124713_0f976596-d53a-4a2e-8cad-ba9d9c6b6e0d.sql
\ir ../migrations/20260915160000_idea_calendar_transfers.sql
\ir ../migrations/20260915161000_calendar_idea_write_roles.sql
INSERT INTO workspace_members VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','manager'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','editor'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','viewer');
INSERT INTO saved_ideas(id,user_id,workspace_id,series_id,episode_number) VALUES
 ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',2);
CREATE FUNCTION reject_test_link() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF current_setting('test.fail_link',true)='true' THEN RAISE EXCEPTION 'injected_link_failure'; END IF; RETURN NEW;
END $$;
CREATE FUNCTION touch_test_source() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at:=clock_timestamp(); RETURN NEW; END $$;
CREATE TRIGGER test_touch_source BEFORE UPDATE ON saved_ideas FOR EACH ROW EXECUTE FUNCTION touch_test_source();
CREATE TRIGGER test_link_failure BEFORE UPDATE ON saved_ideas FOR EACH ROW EXECUTE FUNCTION reject_test_link();
SET ROLE authenticated;
SELECT set_config('test.uid','11111111-1111-4111-8111-111111111111',false);
DO $$
DECLARE idea_id uuid := '55555555-5555-4555-8555-555555555555'; version timestamptz;
 payload jsonb := '{"theme":"R3","canal":"instagram","status":"idea","content_draft":"<p>Texte riche</p>","story_sequence_detail":{"slides":[{"id":"s2"},{"id":"s1"}],"_crosspost":{"source":"private"},"variants":["v1"]},"media_urls":["https://example.test/2.png","https://example.test/1.png"],"stories_timing":{"time":"08:30"},"auto_publish":true,"scheduled_publish_at":"2040-01-01T12:00:00Z"}';
 source_before jsonb; receipt jsonb; again jsonb; post_id uuid; rejected boolean; timestamp_before timestamptz;
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
 SELECT to_jsonb(saved_ideas) INTO source_before FROM saved_ideas WHERE id=idea_id;
 again:=plan_saved_idea(idea_id,'2027-03-28',payload,version);
 IF (SELECT to_jsonb(saved_ideas) FROM saved_ideas WHERE id=idea_id) IS DISTINCT FROM source_before THEN RAISE EXCEPTION 'FAIL source changed by replay'; END IF;
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

-- Writers retain direct insertion, editing and removal in their own workspace.
SET ROLE authenticated;
DO $$ DECLARE u uuid; target uuid; affected int; BEGIN
 FOREACH u IN ARRAY ARRAY['11111111-1111-4111-8111-111111111111'::uuid,'22222222-2222-4222-8222-222222222222'::uuid,'33333333-3333-4333-8333-333333333333'::uuid] LOOP
  PERFORM set_config('test.uid',u::text,false); target:=gen_random_uuid();
  INSERT INTO calendar_posts(id,user_id,workspace_id,date,theme,canal,status) VALUES(target,u,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-10-25','Writer','instagram','drafting');
  UPDATE calendar_posts SET theme='Writer edited' WHERE id=target; GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'FAIL writer calendar update'; END IF;
  DELETE FROM calendar_posts WHERE id=target; GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'FAIL writer calendar delete'; END IF;
  INSERT INTO saved_ideas(id,user_id,workspace_id) VALUES(target,u,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  UPDATE saved_ideas SET status='edited' WHERE id=target; GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'FAIL writer idea update'; END IF;
  DELETE FROM saved_ideas WHERE id=target; GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'FAIL writer idea delete'; END IF;
 END LOOP;
END $$;
RESET ROLE;
-- Direct writes must obey the same contract, including a viewer/revoked member
-- who authored a historical row and can still read it through an own-row policy.
INSERT INTO calendar_posts(id,user_id,workspace_id,date,theme,canal,status) VALUES
 ('77777777-7777-4777-8777-777777777777','44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-10-25','Historical viewer','instagram','drafting'),
 ('88888888-8888-4888-8888-888888888888','88888888-8888-4888-8888-888888888888','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-10-25','Historical revoked','instagram','drafting');
INSERT INTO saved_ideas(id,user_id,workspace_id) VALUES
 ('77777777-7777-4777-8777-777777777777','44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('88888888-8888-4888-8888-888888888888','88888888-8888-4888-8888-888888888888','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
CREATE TEMP TABLE r3_history_posts AS SELECT * FROM calendar_posts;
CREATE TEMP TABLE r3_history_ideas AS SELECT * FROM saved_ideas;
SET ROLE authenticated;
DO $$ DECLARE u uuid; target uuid; affected int; rejected boolean; BEGIN
 FOREACH u IN ARRAY ARRAY['44444444-4444-4444-8444-444444444444'::uuid,'88888888-8888-4888-8888-888888888888'::uuid] LOOP
  target:=CASE WHEN u='44444444-4444-4444-8444-444444444444' THEN '77777777-7777-4777-8777-777777777777'::uuid ELSE u END;
  PERFORM set_config('test.uid',u::text,false);
  IF NOT EXISTS(SELECT 1 FROM calendar_posts WHERE id=target) OR NOT EXISTS(SELECT 1 FROM saved_ideas WHERE id=target) THEN RAISE EXCEPTION 'FAIL historical reads changed'; END IF;
  UPDATE calendar_posts SET theme='Forbidden' WHERE id=target; GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'FAIL direct viewer/revoked calendar update'; END IF;
  UPDATE saved_ideas SET status='Forbidden' WHERE id=target; GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'FAIL direct viewer/revoked idea update'; END IF;
  DELETE FROM calendar_posts WHERE id=target; GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'FAIL direct viewer/revoked calendar delete'; END IF;
  DELETE FROM saved_ideas WHERE id=target; GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'FAIL direct viewer/revoked idea delete'; END IF;
  rejected:=false;
  BEGIN INSERT INTO calendar_posts(id,user_id,workspace_id,date,theme,canal,status) VALUES(gen_random_uuid(),u,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-10-25','Forbidden','instagram','drafting'); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'FAIL direct viewer/revoked calendar insert'; END IF;
  rejected:=false;
  BEGIN INSERT INTO saved_ideas(id,user_id,workspace_id) VALUES(gen_random_uuid(),u,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'FAIL direct viewer/revoked idea insert'; END IF;
  -- The same account retains its personal, workspace-NULL document rights.
  target:=gen_random_uuid();
  INSERT INTO calendar_posts(id,user_id,date,theme,canal,status) VALUES(target,u,'2026-10-25','Personal','instagram','drafting');
  UPDATE calendar_posts SET theme='Personal edited' WHERE id=target; GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'FAIL personal calendar update'; END IF;
  DELETE FROM calendar_posts WHERE id=target;
  INSERT INTO saved_ideas(id,user_id) VALUES(target,u);
  UPDATE saved_ideas SET status='edited' WHERE id=target; GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'FAIL personal idea update'; END IF;
  DELETE FROM saved_ideas WHERE id=target;
 END LOOP;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT * FROM r3_history_posts EXCEPT SELECT * FROM calendar_posts) OR EXISTS(SELECT * FROM r3_history_ideas EXCEPT SELECT * FROM saved_ideas) THEN RAISE EXCEPTION 'FAIL historical rows changed'; END IF;
END $$;
ROLLBACK;
