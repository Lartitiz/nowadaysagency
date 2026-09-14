-- Integration fixture. Run only in an EMPTY disposable PostgreSQL database.
\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
CREATE TABLE public.calendar_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, workspace_id uuid, date date NOT NULL, theme text NOT NULL,
 canal text NOT NULL, status text NOT NULL, format text, objectif text, angle text, content_draft text,
 accroche text, notes text, story_sequence_detail jsonb, media_urls text[], stories_count int,
 stories_structure text, stories_objective text, generated_content_id uuid, generated_content_type text,
 auto_publish boolean NOT NULL DEFAULT false, scheduled_publish_at timestamptz, publish_status text,
 publish_error text, published_post_id text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=clock_timestamp(); RETURN NEW; END $$;
CREATE TABLE public.workspace_members(workspace_id uuid,user_id uuid,role text);
CREATE TABLE public.launches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,workspace_id uuid,name text,template_type text,extra_weekly_hours int,phases jsonb,plan_generated boolean,plan_sent_to_calendar boolean,updated_at timestamptz DEFAULT now());
CREATE TABLE public.launch_plan_contents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,workspace_id uuid,launch_id uuid REFERENCES launches(id),phase text,content_date date NOT NULL,format text,accroche text,contenu text,objectif text,tip text,is_edited boolean DEFAULT false,added_to_calendar boolean DEFAULT false,sort_order int,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),content_type text,content_type_emoji text,category text,objective text,angle_suggestion text,sent_to_calendar boolean,chapter int,chapter_label text,audience_phase text,story_sequence_detail jsonb);
ALTER TABLE calendar_posts ADD COLUMN launch_id uuid REFERENCES launches(id), ADD COLUMN content_type text,ADD COLUMN content_type_emoji text,ADD COLUMN category text,ADD COLUMN objective text,ADD COLUMN angle_suggestion text,ADD COLUMN chapter int,ADD COLUMN chapter_label text,ADD COLUMN audience_phase text;
ALTER TABLE launches ENABLE ROW LEVEL SECURITY;
ALTER TABLE launch_plan_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_posts ON calendar_posts USING((workspace_id IS NULL AND user_id=auth.uid()) OR EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=calendar_posts.workspace_id AND m.user_id=auth.uid() AND m.role IN ('owner','manager')));
\ir ../migrations/20260704134745_e4a6355c-efda-4949-8aa8-f2818bd401b9.sql
\ir ../migrations/20260914124242_1ac59d7a-0dd2-4759-8dbb-5f970f9b640d.sql
GRANT SELECT ON workspace_members TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON launches,launch_plan_contents,calendar_posts TO authenticated;
INSERT INTO workspace_members VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'),('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','manager'),('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','viewer');
INSERT INTO launches(id,user_id,workspace_id,name) VALUES ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Fixture');
INSERT INTO launch_plan_contents(id,user_id,workspace_id,launch_id,phase,content_date,format,objective,contenu,story_sequence_detail) VALUES
('55555555-5555-4555-8555-555555555551','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','teasing','2040-01-01','post','confiance','Ancien texte travaillé','{"slides":[{"text":"Original"}]}'),
('55555555-5555-4555-8555-555555555552','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','vente','2040-01-01','post','vente',null,null);
CREATE FUNCTION fail_launch_metadata() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('test.fail',true)='yes' THEN RAISE EXCEPTION 'injected_failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER fixture_failure BEFORE UPDATE ON launches FOR EACH ROW EXECUTE FUNCTION fail_launch_metadata();
SET ROLE authenticated;
SELECT set_config('test.uid','22222222-2222-4222-8222-222222222222',true);
DO $$ DECLARE
 l uuid:='44444444-4444-4444-8444-444444444444'; w uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 ids uuid[]:=ARRAY['55555555-5555-4555-8555-555555555551','55555555-5555-4555-8555-555555555552']::uuid[];
 r jsonb; before_rows jsonb; failed boolean; rev timestamptz;
BEGIN
 -- A manager can write the owner's launch. Last metadata failure rolls back both tables.
 PERFORM set_config('test.fail','yes',true); failed:=false;
 BEGIN PERFORM sync_launch_calendar(l,w,ids,false); EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='injected_failure'; END;
 IF NOT failed OR EXISTS(SELECT 1 FROM calendar_posts) OR EXISTS(SELECT 1 FROM launch_plan_contents WHERE sent_to_calendar) THEN RAISE EXCEPTION 'FAIL atomic rollback'; END IF;
 PERFORM set_config('test.fail','no',true);
 r:=sync_launch_calendar(l,w,ids[1:1],false);
 IF r->>'inserted'<>'1' OR jsonb_array_length(r->'items')<>1 OR (SELECT plan_sent_to_calendar FROM launches WHERE id=l) THEN RAISE EXCEPTION 'FAIL partial selection'; END IF;
 failed:=false; BEGIN PERFORM sync_launch_calendar(l,w,ids,false); EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='launch_replace_confirmation_required'; END;
 IF NOT failed THEN RAISE EXCEPTION 'FAIL replacement confirmation'; END IF;
 r:=sync_launch_calendar(l,w,ids,true);
 IF r->>'inserted'<>'1' OR (SELECT count(*) FROM calendar_posts)<>2 OR NOT (SELECT plan_sent_to_calendar FROM launches WHERE id=l) THEN RAISE EXCEPTION 'FAIL resume selection'; END IF;
 IF NOT EXISTS(SELECT 1 FROM calendar_posts WHERE content_draft='Ancien texte travaillé' AND story_sequence_detail->'slides' IS NOT NULL) THEN RAISE EXCEPTION 'FAIL old structured content'; END IF;
 -- Retry after a lost response keeps both slot IDs on the same day, without deduping them.
 SELECT jsonb_agg(id ORDER BY id) INTO before_rows FROM calendar_posts;
 r:=sync_launch_calendar(l,w,ids,true);
 IF r->>'inserted'<>'0' OR before_rows IS DISTINCT FROM (SELECT jsonb_agg(id ORDER BY id) FROM calendar_posts) THEN RAISE EXCEPTION 'FAIL replay'; END IF;
 UPDATE calendar_posts SET content_draft='Version modifiée',auto_publish=true,scheduled_publish_at='2040-01-01 10:00Z',publish_status='scheduled',media_urls=ARRAY['https://example.test/photo'],status='drafting';
 SELECT jsonb_agg(to_jsonb(p) ORDER BY id) INTO before_rows FROM calendar_posts p;
 UPDATE launch_plan_contents SET content_date='2040-01-05';
 r:=sync_launch_calendar(l,w,ids,true);
 IF r->>'preserved'<>'2' OR before_rows IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM calendar_posts p) THEN RAISE EXCEPTION 'FAIL scheduled content preservation'; END IF;
 UPDATE calendar_posts SET publish_status='published',status='published',published_post_id='receipt';
 SELECT jsonb_agg(to_jsonb(p) ORDER BY id) INTO before_rows FROM calendar_posts p;
 PERFORM sync_launch_calendar(l,w,ids,true);
 IF before_rows IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM calendar_posts p) THEN RAISE EXCEPTION 'FAIL published preservation'; END IF;
 failed:=false; BEGIN PERFORM sync_launch_calendar(l,NULL,ids,true); EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='launch_not_found'; END;
 IF NOT failed THEN RAISE EXCEPTION 'FAIL target mismatch'; END IF;
 SELECT updated_at INTO rev FROM launches WHERE id=l;
 PERFORM set_config('test.fail','yes',true); failed:=false;
 BEGIN PERFORM save_launch_plan(l,w,rev,'[{"id":"66666666-6666-4666-8666-666666666666","phase":"vente","date":"2040-01-07"}]','{"template_type":"classique","extra_weekly_hours":0,"phases":[{"name":"vente"}]}'); EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='injected_failure'; END;
 IF NOT failed OR EXISTS(SELECT 1 FROM launch_plan_contents WHERE archived_at IS NOT NULL) THEN RAISE EXCEPTION 'FAIL regeneration rollback'; END IF;
 PERFORM set_config('test.fail','no',true);
 r:=save_launch_plan(l,w,rev,'[{"id":"66666666-6666-4666-8666-666666666666","phase":"vente","date":"2040-01-07"}]','{"template_type":"classique","extra_weekly_hours":0,"phases":[{"name":"vente"}]}');
 IF (SELECT count(*) FROM launch_plan_contents WHERE archived_at IS NOT NULL)<>2 OR before_rows IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM calendar_posts p) THEN RAISE EXCEPTION 'FAIL regeneration history'; END IF;
 r:=save_launch_plan(l,w,rev,'[{"id":"66666666-6666-4666-8666-666666666666","phase":"vente","date":"2040-01-07"}]','{"template_type":"classique","extra_weekly_hours":0,"phases":[{"name":"vente"}]}');
 IF r->>'replayed'<>'true' OR (SELECT count(*) FROM launch_plan_contents)<>3 THEN RAISE EXCEPTION 'FAIL generation replay'; END IF;
 failed:=false;
 BEGIN PERFORM save_launch_plan(l,w,rev,'[{"id":"66666666-6666-4666-8666-666666666666","phase":"vente","date":"2040-01-09","objective":"Different proposal"}]','{"template_type":"classique","extra_weekly_hours":0,"phases":[{"name":"vente"}]}'); EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='launch_replay_conflict'; END;
 IF NOT failed OR (SELECT content_date FROM launch_plan_contents WHERE id='66666666-6666-4666-8666-666666666666')<>'2040-01-07' THEN RAISE EXCEPTION 'FAIL same IDs different proposal accepted'; END IF;
 failed:=false;
 BEGIN PERFORM save_launch_plan(l,w,rev,'[{"id":"66666666-6666-4666-8666-666666666666","phase":"vente","date":"2040-01-07"}]','{"template_type":"different","extra_weekly_hours":10,"phases":[]}'); EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='launch_replay_conflict'; END;
 IF NOT failed THEN RAISE EXCEPTION 'FAIL same IDs different metadata accepted'; END IF;

END $$;
SELECT set_config('test.uid','33333333-3333-4333-8333-333333333333',true);
DO $$ DECLARE failed boolean:=false; BEGIN
 BEGIN PERFORM sync_launch_calendar('44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',ARRAY['66666666-6666-4666-8666-666666666666']::uuid[],true); EXCEPTION WHEN OTHERS THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'FAIL reader denied'; END IF;
END $$;
SELECT set_config('test.uid','77777777-7777-4777-8777-777777777777',true);
DO $$ DECLARE failed boolean:=false; BEGIN
 BEGIN PERFORM sync_launch_calendar('44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',ARRAY['66666666-6666-4666-8666-666666666666']::uuid[],true); EXCEPTION WHEN OTHERS THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'FAIL stranger denied'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN IF has_function_privilege('anon','sync_launch_calendar(uuid,uuid,uuid[],boolean)','EXECUTE') THEN RAISE EXCEPTION 'FAIL anonymous execute'; END IF; END $$;

-- Personal history has no workspace: keep legacy IDs and refuse ambiguous linkage.
INSERT INTO launches(id,user_id,name) VALUES ('88888888-8888-4888-8888-888888888888','11111111-1111-4111-8111-111111111111','Personnel');
INSERT INTO launch_plan_contents(id,user_id,launch_id,phase,content_date,format,objective)
VALUES ('99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111','88888888-8888-4888-8888-888888888888','vente','2040-01-01','post','vente');
INSERT INTO calendar_posts(id,user_id,date,theme,canal,status,format,objective,launch_id,content_draft)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','2040-01-01','Titre ancien modifié','instagram','published','post','vente','88888888-8888-4888-8888-888888888888','Ancienne version');
SET ROLE authenticated;
SELECT set_config('test.uid','11111111-1111-4111-8111-111111111111',true);
DO $$ DECLARE r jsonb; snapshot jsonb; BEGIN
 SELECT to_jsonb(c) INTO snapshot FROM calendar_posts c WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 r:=sync_launch_calendar('88888888-8888-4888-8888-888888888888',NULL,ARRAY['99999999-9999-4999-8999-999999999999']::uuid[],true);
 IF r->>'preserved'<>'1' OR r->>'inserted'<>'0' OR snapshot IS DISTINCT FROM (SELECT to_jsonb(c) FROM calendar_posts c WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') THEN RAISE EXCEPTION 'FAIL legacy personal mapping'; END IF;
END $$;
RESET ROLE;
INSERT INTO launch_plan_contents(id,user_id,launch_id,phase,content_date,format,objective)
VALUES ('99999999-9999-4999-8999-999999999998','11111111-1111-4111-8111-111111111111','88888888-8888-4888-8888-888888888888','vente','2040-02-01','post','vente');
INSERT INTO calendar_posts(user_id,date,theme,canal,status,format,objective,launch_id)
SELECT '11111111-1111-4111-8111-111111111111','2040-02-01','Ambiguous','instagram','idea','post','vente','88888888-8888-4888-8888-888888888888' FROM generate_series(1,2);
SET ROLE authenticated;
SELECT set_config('test.uid','11111111-1111-4111-8111-111111111111',true);
DO $$ DECLARE failed boolean:=false; snapshot jsonb; BEGIN
 SELECT jsonb_agg(to_jsonb(c) ORDER BY id) INTO snapshot FROM calendar_posts c;
 BEGIN PERFORM sync_launch_calendar('88888888-8888-4888-8888-888888888888',NULL,ARRAY['99999999-9999-4999-8999-999999999998']::uuid[],true); EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='launch_legacy_review_required'; END;
 IF NOT failed OR snapshot IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM calendar_posts c) THEN RAISE EXCEPTION 'FAIL ambiguous legacy preservation'; END IF;
END $$;
RESET ROLE;

UPDATE launch_plan_contents SET archived_at=now() WHERE id='99999999-9999-4999-8999-999999999999';
INSERT INTO launch_plan_contents(id,user_id,launch_id,phase,content_date,format,objective)
VALUES ('99999999-9999-4999-8999-999999999997','11111111-1111-4111-8111-111111111111','88888888-8888-4888-8888-888888888888','vente','2040-01-01','post','vente');
SET ROLE authenticated;
SELECT set_config('test.uid','11111111-1111-4111-8111-111111111111',true);
DO $$ DECLARE r jsonb; n int; BEGIN
 SELECT count(*) INTO n FROM calendar_posts;
 r:=sync_launch_calendar('88888888-8888-4888-8888-888888888888',NULL,ARRAY['99999999-9999-4999-8999-999999999997']::uuid[],true);
 IF r->>'inserted'<>'0' OR (SELECT count(*) FROM calendar_posts)<>n OR
   (SELECT count(*) FROM launch_plan_contents WHERE calendar_post_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')<>2 THEN RAISE EXCEPTION 'FAIL regenerated matching slot duplicate or lost historical relation'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
