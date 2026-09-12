-- Run only against an EMPTY disposable database. No customer fixtures.
\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE authenticated; CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
CREATE TABLE public.workspaces(id uuid PRIMARY KEY);
CREATE TABLE public.workspace_members(workspace_id uuid, user_id uuid, role text);
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.user_has_workspace_access(ws_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=ws_id AND user_id=auth.uid())
$$;
CREATE POLICY members_read ON workspace_members FOR SELECT TO authenticated USING (user_has_workspace_access(workspace_id));
GRANT SELECT ON workspace_members TO authenticated;
\ir ../migrations/20260225092738_ffee24a8-9744-4d80-9abf-fb9f47917a22.sql
\ir ../migrations/20260225143557_5457ce71-a035-4c01-8057-17ef5e4a421d.sql
-- Existing cross-table restrictive policy, also verified on the live schema.
\ir ../migrations/20260630091107_3b84ce9b-2c15-4512-b98c-42c84299b249.sql
GRANT SELECT, INSERT, UPDATE, DELETE ON voice_guides, branding_mirror_results TO authenticated, anon;
INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333');
INSERT INTO workspaces VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO workspace_members VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','owner'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','manager'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333','manager'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','viewer');
INSERT INTO voice_guides(user_id, workspace_id, guide_data) VALUES
 ('11111111-1111-4111-8111-111111111111',NULL,'{"legacy":"unchanged"}'),
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{"old":"A"}');
INSERT INTO branding_mirror_results(user_id,workspace_id,summary) VALUES
 ('11111111-1111-4111-8111-111111111111',NULL,'legacy'),
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','old A'),
 ('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','old manager');
CREATE TEMP TABLE before_guides AS SELECT * FROM voice_guides;
CREATE TEMP TABLE before_mirrors AS SELECT * FROM branding_mirror_results;
-- Reproduce the previous UI bug against the original table contract.
DO $$ DECLARE rejected boolean := false; BEGIN
 BEGIN INSERT INTO branding_mirror_results(user_id) VALUES ('11111111-1111-4111-8111-111111111111') ON CONFLICT(user_id) DO UPDATE SET summary='lost';
 EXCEPTION WHEN invalid_column_reference THEN rejected := true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'expected original conflict mismatch'; END IF;
END $$;
\ir ../migrations/20260912190000_voice_guide_mirror_workspace.sql
-- Every field and ID survives the migration, not just row counts.
DO $$ BEGIN
 IF EXISTS(SELECT * FROM before_guides EXCEPT SELECT * FROM voice_guides) OR EXISTS(SELECT * FROM before_mirrors EXCEPT SELECT * FROM branding_mirror_results) THEN RAISE EXCEPTION 'history changed'; END IF;
END $$;
SET ROLE authenticated;
SELECT set_config('test.uid','33333333-3333-4333-8333-333333333333',true);
DO $$ DECLARE n int; BEGIN
 IF (SELECT count(*) FROM voice_guides)<>1 THEN RAISE EXCEPTION 'manager must read A, not owner legacy'; END IF;
 FOR n IN 1..2 LOOP
 INSERT INTO voice_guides(user_id,workspace_id,guide_data) VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',jsonb_build_object('version',n));
 INSERT INTO branding_mirror_results(user_id,workspace_id,summary) VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','new A '||n);
 END LOOP;
 INSERT INTO voice_guides(user_id,workspace_id,guide_data) VALUES ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','{"new":"B"}');
 INSERT INTO branding_mirror_results(user_id,workspace_id,summary) VALUES ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','new B');
 BEGIN
 INSERT INTO voice_guides(user_id,workspace_id,guide_data) VALUES ('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{}');
 RAISE EXCEPTION 'accepted manager as owner'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
-- Owner sees personal legacy plus A history; never B.
SELECT set_config('test.uid','11111111-1111-4111-8111-111111111111',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM voice_guides)<>4 THEN RAISE EXCEPTION 'owner history access'; END IF;
 IF EXISTS(SELECT 1 FROM branding_mirror_results WHERE workspace_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') THEN RAISE EXCEPTION 'cross-space leak'; END IF;
 INSERT INTO voice_guides(user_id,workspace_id,guide_data) VALUES (auth.uid(),NULL,'{"legacy":"new"}');
END $$;
-- Viewer can read but cannot generate; outsiders cannot read or insert.
DO $$ DECLARE actor text; t text; BEGIN
 FOREACH actor IN ARRAY ARRAY['44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555'] LOOP
 PERFORM set_config('test.uid',actor,true);
 IF actor LIKE '5555%' AND (EXISTS(SELECT 1 FROM voice_guides) OR EXISTS(SELECT 1 FROM branding_mirror_results)) THEN RAISE EXCEPTION 'outsider read'; END IF;
 BEGIN INSERT INTO voice_guides(user_id,workspace_id,guide_data) VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{}'); RAISE EXCEPTION 'forbidden guide write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO branding_mirror_results(user_id,workspace_id,summary) VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','forbidden'); RAISE EXCEPTION 'forbidden mirror write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
END $$;
RESET ROLE;
DELETE FROM workspace_members WHERE user_id='33333333-3333-4333-8333-333333333333';
SET ROLE authenticated;
SELECT set_config('test.uid','33333333-3333-4333-8333-333333333333',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM voice_guides) OR EXISTS(SELECT 1 FROM branding_mirror_results) THEN RAISE EXCEPTION 'revoked member reads previous authored results'; END IF;
 BEGIN INSERT INTO branding_mirror_results(user_id,workspace_id,summary) VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','forbidden'); RAISE EXCEPTION 'revoked write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT * FROM before_guides EXCEPT SELECT * FROM voice_guides) OR EXISTS(SELECT * FROM before_mirrors EXCEPT SELECT * FROM branding_mirror_results) THEN RAISE EXCEPTION 'generation changed history'; END IF;
END $$;
ROLLBACK;
