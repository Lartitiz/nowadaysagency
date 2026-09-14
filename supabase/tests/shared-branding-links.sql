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
CREATE TABLE public.shared_branding_links (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, workspace_id uuid, token text DEFAULT gen_random_uuid()::text UNIQUE, is_active boolean DEFAULT true, expires_at timestamptz DEFAULT now()+interval '30 days', created_at timestamptz DEFAULT now(), views_count int DEFAULT 0);
ALTER TABLE shared_branding_links ENABLE ROW LEVEL SECURITY;
GRANT ALL ON shared_branding_links TO authenticated, anon;
CREATE POLICY "Users manage own links" ON shared_branding_links FOR ALL TO authenticated USING (auth.uid()=user_id OR user_has_workspace_access(workspace_id)) WITH CHECK (auth.uid()=user_id OR user_has_workspace_access(workspace_id));
CREATE POLICY tenant_immovable ON shared_branding_links AS RESTRICTIVE FOR ALL TO authenticated WITH CHECK ((workspace_id IS NULL) OR user_has_workspace_access(workspace_id));
INSERT INTO workspace_members VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','owner'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','manager'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333','manager'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','viewer'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','66666666-6666-4666-8666-666666666666','editor');
INSERT INTO shared_branding_links(user_id,workspace_id,token) VALUES
 ('11111111-1111-4111-8111-111111111111',NULL,'legacy'),
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','b');
INSERT INTO shared_branding_links(user_id,workspace_id,token) VALUES ('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','historical-wrong-owner');
CREATE TEMP TABLE before_links AS SELECT * FROM shared_branding_links;
-- Reproduce actual pre-migration reader write, then restore the fixture.
SET ROLE authenticated;
SELECT set_config('test.uid','44444444-4444-4444-8444-444444444444',true);
DO $$ BEGIN
 UPDATE shared_branding_links SET is_active=false WHERE token='a';
 IF NOT FOUND THEN RAISE EXCEPTION 'original viewer-write defect not reproduced'; END IF;
 UPDATE shared_branding_links SET is_active=true WHERE token='a';
END $$;
RESET ROLE;
\ir ../migrations/20260914150000_shared_branding_links_scope.sql
DO $$ BEGIN
 IF EXISTS(SELECT * FROM before_links EXCEPT SELECT * FROM shared_branding_links) THEN RAISE EXCEPTION 'history modified'; END IF;
END $$;
SET ROLE authenticated;
SELECT set_config('test.uid','33333333-3333-4333-8333-333333333333',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM shared_branding_links)<>3 THEN RAISE EXCEPTION 'manager read must exclude owner personal legacy'; END IF;
 INSERT INTO shared_branding_links(user_id,workspace_id,token) VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','manager-a');
 INSERT INTO shared_branding_links(user_id,workspace_id,token) VALUES ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','manager-b');
 UPDATE shared_branding_links SET is_active=false WHERE token='manager-a';
 IF NOT FOUND THEN RAISE EXCEPTION 'manager revoke denied'; END IF;
 UPDATE shared_branding_links SET is_active=false WHERE token='historical-wrong-owner';
 IF NOT FOUND THEN RAISE EXCEPTION 'cannot revoke historical invalid owner'; END IF;
 BEGIN
 INSERT INTO shared_branding_links(user_id,workspace_id) VALUES (auth.uid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 RAISE EXCEPTION 'wrong owner accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('test.uid','11111111-1111-4111-8111-111111111111',true);
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM shared_branding_links WHERE token='legacy') OR EXISTS(SELECT FROM shared_branding_links WHERE token='b') THEN RAISE EXCEPTION 'owner scope incorrect'; END IF;
 INSERT INTO shared_branding_links(user_id,workspace_id,token) VALUES (auth.uid(),NULL,'personal-new');
 UPDATE shared_branding_links SET is_active=false WHERE token='a';
 IF NOT FOUND THEN RAISE EXCEPTION 'owner revoke failed'; END IF;
END $$;
SELECT set_config('test.uid','66666666-6666-4666-8666-666666666666',true);
INSERT INTO shared_branding_links(user_id,workspace_id,token) VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','editor');
DO $$ DECLARE actor text; BEGIN
 FOREACH actor IN ARRAY ARRAY['44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555'] LOOP
 PERFORM set_config('test.uid',actor,true);
 IF actor LIKE '4444%' AND NOT EXISTS(SELECT FROM shared_branding_links WHERE token='a') THEN RAISE EXCEPTION 'viewer read removed'; END IF;
 IF actor LIKE '5555%' AND EXISTS(SELECT FROM shared_branding_links) THEN RAISE EXCEPTION 'outsider read allowed'; END IF;
 UPDATE shared_branding_links SET is_active=false WHERE token='editor';
 IF FOUND THEN RAISE EXCEPTION 'forbidden update'; END IF;
 DELETE FROM shared_branding_links WHERE token='a';
 IF FOUND THEN RAISE EXCEPTION 'forbidden delete'; END IF;
 BEGIN INSERT INTO shared_branding_links(user_id,workspace_id) VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); RAISE EXCEPTION 'forbidden insert'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
END $$;
RESET ROLE;
DELETE FROM workspace_members WHERE user_id='33333333-3333-4333-8333-333333333333';
SET ROLE authenticated;
SELECT set_config('test.uid','33333333-3333-4333-8333-333333333333',true);
DO $$ BEGIN
 IF EXISTS(SELECT FROM shared_branding_links) THEN RAISE EXCEPTION 'removed member reads'; END IF;
 UPDATE shared_branding_links SET is_active=false WHERE token='editor';
 IF FOUND THEN RAISE EXCEPTION 'removed member writes'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
