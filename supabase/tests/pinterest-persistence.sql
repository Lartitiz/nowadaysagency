-- Disposable PostgreSQL database only. No production data.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA auth;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
CREATE TABLE public.workspace_members(workspace_id uuid, user_id uuid, role text);
CREATE FUNCTION public.user_workspace_role(ws_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT role FROM workspace_members WHERE workspace_id=ws_id AND user_id=auth.uid() $$;
CREATE FUNCTION public.user_has_workspace_access(ws_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT FROM workspace_members WHERE workspace_id=ws_id AND user_id=auth.uid()) $$;
\ir ../migrations/20260220222724_bbade018-8a42-4b11-bdec-8bd217143a72.sql
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['pinterest_profile','pinterest_keywords','pinterest_boards','pinterest_routine','pinterest_pins'] LOOP
 EXECUTE format('ALTER TABLE public.%I ADD COLUMN workspace_id uuid',t);
 EXECUTE format('CREATE POLICY tenant_immovable ON public.%I AS RESTRICTIVE FOR ALL TO authenticated WITH CHECK (workspace_id IS NULL OR user_has_workspace_access(workspace_id))',t);
END LOOP; END $$;
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
INSERT INTO workspace_members VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','owner'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','manager'),
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','manager'),
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','viewer'),
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','editor');
INSERT INTO pinterest_boards(id,user_id,workspace_id,name,description,board_type,sort_order) VALUES
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Original','Description','coulisses',2),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',NULL,'Personnel','Ancien','autre',0);
INSERT INTO pinterest_pins(id,user_id,workspace_id,board_id,title,description,link_url,variant_type) VALUES
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Titre','Texte','https://example.test','storytelling');
-- Unknown future / media columns must survive RPC updates untouched.
ALTER TABLE pinterest_pins ADD COLUMN media jsonb DEFAULT '{"url":"preserved"}';
CREATE TEMP TABLE before_migration AS SELECT to_jsonb(b) row FROM pinterest_boards b;
\ir ../migrations/20260914110000_pinterest_persistence.sql
DO $$ BEGIN IF EXISTS(SELECT row FROM before_migration EXCEPT SELECT to_jsonb(b) FROM pinterest_boards b) THEN RAISE EXCEPTION 'Migration changed historical rows'; END IF; END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
DO $$
DECLARE a uuid := '20000000-0000-0000-0000-000000000001'; b uuid := '20000000-0000-0000-0000-000000000002';
 old jsonb; result jsonb; payload jsonb; pin_before jsonb; t text;
BEGIN
 SELECT jsonb_agg(to_jsonb(x)) INTO old FROM pinterest_boards x WHERE workspace_id=a;
 SELECT to_jsonb(x) INTO pin_before FROM pinterest_pins x;
 -- Atomic rollback when the second row violates NOT NULL; old board and FK survive.
 payload := jsonb_build_array(jsonb_build_object('id',old->0->>'id','name','Edited','description','Preserved','board_type','coulisses','sort_order',0), jsonb_build_object('id','30000000-0000-0000-0000-000000000003','name',null));
 BEGIN PERFORM save_pinterest_editor('pinterest_boards',a,null,old,payload); RAISE EXCEPTION 'Expected failure'; EXCEPTION WHEN not_null_violation THEN NULL; END;
 IF (SELECT jsonb_agg(to_jsonb(x)) FROM pinterest_boards x WHERE workspace_id=a) IS DISTINCT FROM old THEN RAISE EXCEPTION 'Failed save lost boards'; END IF;
 IF (SELECT to_jsonb(x) FROM pinterest_pins x) IS DISTINCT FROM pin_before THEN RAISE EXCEPTION 'Failed save lost pin relationship'; END IF;
 payload := jsonb_build_array(jsonb_build_object('id',old->0->>'id','name','Edited','description','Preserved','board_type','coulisses','sort_order',0));
 result := save_pinterest_editor('pinterest_boards',a,null,old,payload);
 IF result->0->>'id' <> old->0->>'id' OR result->0->>'name' <> 'Edited' THEN RAISE EXCEPTION 'ID or edit lost'; END IF;
 IF (SELECT to_jsonb(x) FROM pinterest_pins x) IS DISTINCT FROM pin_before THEN RAISE EXCEPTION 'Successful save lost pin relationship'; END IF;
 -- Lost response retry and another edit using returned snapshot.
 IF save_pinterest_editor('pinterest_boards',a,null,old,payload) IS DISTINCT FROM result THEN RAISE EXCEPTION 'Retry not idempotent'; END IF;
 payload := jsonb_set(payload,'{0,name}','"Second edit"');
 result := save_pinterest_editor('pinterest_boards',a,null,result,payload);
 BEGIN PERFORM save_pinterest_editor('pinterest_boards',a,null,old,jsonb_set(payload,'{0,name}','"Stale"')); RAISE EXCEPTION 'Stale overwrite accepted'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 -- Same creator has access to both A+B, but cannot transplant an existing row.
 BEGIN UPDATE pinterest_boards SET workspace_id=b WHERE id=(old->0->>'id')::uuid; RAISE EXCEPTION 'Transplant accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM save_pinterest_editor('pinterest_boards',b,null,'[]',payload); RAISE EXCEPTION 'Other scope ID accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
 IF NOT EXISTS(SELECT FROM pinterest_boards WHERE workspace_id IS NULL AND name='Personnel') THEN RAISE EXCEPTION 'Personal history lost'; END IF;
 -- Singleton receipt, categories only inspiration/English, checklist and monthly history.
 result := save_pinterest_editor('pinterest_keywords',a,null,'[]','[{"id":"50000000-0000-0000-0000-000000000001","keywords_raw":"Brut","keywords_inspiration":["Inspiration"],"keywords_english":["English"],"checklist_bio":true}]');
 result := save_pinterest_editor('pinterest_keywords',a,null,result,jsonb_build_array(jsonb_build_object('id',result->0->>'id','keywords_raw','Edited')));
 IF result->0->'keywords_english' <> '["English"]' OR result->0->'checklist_bio' <> 'true' THEN RAISE EXCEPTION 'Categories/checklist lost'; END IF;
 result := save_pinterest_editor('pinterest_routine',a,'2026-09-01','[]','[{"id":"60000000-0000-0000-0000-000000000001","current_month":"2026-09-01","pins_done":4}]');
 PERFORM save_pinterest_editor('pinterest_routine',b,'2026-09-01','[]','[{"id":"60000000-0000-0000-0000-000000000002","current_month":"2026-09-01","pins_done":2}]');
 PERFORM save_pinterest_editor('pinterest_routine',a,'2026-08-01','[]','[{"id":"60000000-0000-0000-0000-000000000003","current_month":"2026-08-01","pins_done":9}]');
 IF (SELECT count(*) FROM pinterest_routine) <> 3 THEN RAISE EXCEPTION 'Routine history/scope lost'; END IF;
 BEGIN PERFORM save_pinterest_editor('pinterest_routine',a,'2026-09-01',result,jsonb_set(result,'{0,current_month}','"2026-08-01"')); RAISE EXCEPTION 'Month transplant accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 -- Pin media/links/text survive patch, cross-space board rejected.
 SELECT jsonb_agg(to_jsonb(x)) INTO old FROM pinterest_pins x;
 result := save_pinterest_editor('pinterest_pins',a,null,old,'[{"id":"40000000-0000-0000-0000-000000000001","title":"New title"}]');
 IF result->0->'media' <> pin_before->'media' OR result->0->'link_url' <> pin_before->'link_url' OR result->0->'variant_type' <> pin_before->'variant_type' THEN RAISE EXCEPTION 'Pin fields lost'; END IF;
 BEGIN PERFORM save_pinterest_editor('pinterest_pins',b,null,'[]','[{"id":"40000000-0000-0000-0000-000000000002","board_id":"30000000-0000-0000-0000-000000000001"}]'); RAISE EXCEPTION 'Cross-space board allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- Personal write never adopts the workspace row.
 PERFORM save_pinterest_editor('pinterest_profile',null,null,'[]','[{"id":"70000000-0000-0000-0000-000000000001","bio":"Personnel"}]');
 IF NOT EXISTS(SELECT FROM pinterest_profile WHERE workspace_id IS NULL AND bio='Personnel') THEN RAISE EXCEPTION 'Personal write broken'; END IF;
END $$;
-- Manager retains their own rows only, does not gain access to owner's rows.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
DO $$ BEGIN
 IF EXISTS(SELECT FROM pinterest_boards) THEN RAISE EXCEPTION 'Cross-creator grant added'; END IF;
 PERFORM save_pinterest_editor('pinterest_boards','20000000-0000-0000-0000-000000000001',null,'[]','[{"id":"30000000-0000-0000-0000-000000000004","name":"Manager"}]');
END $$;
-- Viewer, editor and outsider cannot write; direct API cannot bypass the RPC.
DO $$ DECLARE u text; BEGIN FOREACH u IN ARRAY ARRAY['10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000005'] LOOP
 PERFORM set_config('request.jwt.claim.sub',u,true);
 BEGIN PERFORM save_pinterest_editor('pinterest_boards','20000000-0000-0000-0000-000000000001',null,'[]','[]'); RAISE EXCEPTION 'Role write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO pinterest_boards(user_id,workspace_id,name) VALUES(auth.uid(),'20000000-0000-0000-0000-000000000001','No'); RAISE EXCEPTION 'Direct role write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END LOOP; END $$;
RESET ROLE;
-- Revoking membership hides creator's workspace rows; historical personal data survives.
DELETE FROM workspace_members WHERE user_id='10000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
DO $$ BEGIN IF EXISTS(SELECT FROM pinterest_boards WHERE workspace_id IS NOT NULL) THEN RAISE EXCEPTION 'Revoked creator can read workspace'; END IF;
 IF NOT EXISTS(SELECT FROM pinterest_boards WHERE workspace_id IS NULL) THEN RAISE EXCEPTION 'Personal inaccessible'; END IF; END $$;
ROLLBACK;
