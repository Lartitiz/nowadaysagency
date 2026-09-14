-- Disposable database only; does not access client data.
BEGIN;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE public.calendar_shares(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, workspace_id uuid,
 share_token text UNIQUE, is_active boolean DEFAULT true, expires_at timestamptz, canal_filter text DEFAULT 'all',
 guest_can_edit_status boolean DEFAULT true, guest_can_edit_wording boolean DEFAULT false, show_content_draft boolean DEFAULT false, guest_name text);
CREATE TABLE public.calendar_posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, workspace_id uuid, canal text,
 status text, content_draft text, content_data jsonb, media_urls jsonb, updated_at timestamptz DEFAULT now());
CREATE TABLE public.calendar_comments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), calendar_post_id uuid REFERENCES public.calendar_posts(id),
 share_id uuid REFERENCES public.calendar_shares(id), author_name text, author_role text, content text, created_at timestamptz DEFAULT now());
INSERT INTO public.calendar_shares(user_id,share_token) VALUES ('10000000-0000-0000-0000-000000000001','legacy');
-- The existing comment policy grants writes to the share owner only.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT SELECT ON public.calendar_shares,public.calendar_posts TO authenticated;
GRANT SELECT,INSERT ON public.calendar_comments TO authenticated;
ALTER TABLE public.calendar_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can insert comments" ON public.calendar_comments FOR INSERT TO authenticated WITH CHECK (
 EXISTS (SELECT 1 FROM public.calendar_shares cs WHERE cs.id=share_id AND cs.user_id=auth.uid()));
CREATE POLICY "Owner can select comments" ON public.calendar_comments FOR SELECT TO authenticated USING (
 EXISTS (SELECT 1 FROM public.calendar_shares cs WHERE cs.id=share_id AND cs.user_id=auth.uid()));
\ir ../migrations/20260914124114_a3377741-e722-4a33-a69b-b7ca2776ca4f.sql
DO $$
DECLARE u uuid:='10000000-0000-0000-0000-000000000001'; w uuid:='20000000-0000-0000-0000-000000000001';
 p uuid; other_channel uuid; other_workspace uuid; personal uuid; other_owner uuid;
 receipt uuid:=gen_random_uuid(); r jsonb; before_data jsonb; t timestamptz;
BEGIN
 INSERT INTO public.calendar_shares(user_id,workspace_id,share_token,canal_filter,guest_can_edit_wording,show_content_draft)
 VALUES(u,w,'scoped','instagram',true,true),(u,NULL,'personal','all',true,true);
 INSERT INTO public.calendar_posts(user_id,workspace_id,canal,status,content_draft,content_data,media_urls)
 VALUES(u,w,'instagram','ready','[{"title":"Original","image":"keep.png","id":"same"}]','{"slides":[1,2]}','["photo.png"]') RETURNING id,updated_at INTO p,t;
 INSERT INTO public.calendar_posts(user_id,workspace_id,canal,status) VALUES(u,w,'linkedin','ready') RETURNING id INTO other_channel;
 INSERT INTO public.calendar_posts(user_id,workspace_id,canal,status) VALUES(u,gen_random_uuid(),'instagram','ready') RETURNING id INTO other_workspace;
 INSERT INTO public.calendar_posts(user_id,canal,status) VALUES(u,'instagram','ready') RETURNING id INTO personal;
 INSERT INTO public.calendar_posts(user_id,canal,status) VALUES(gen_random_uuid(),'instagram','ready') RETURNING id INTO other_owner;
 IF NOT (SELECT legacy_owner_scope FROM public.calendar_shares WHERE share_token='legacy') OR (SELECT legacy_owner_scope FROM public.calendar_shares WHERE share_token='personal') THEN RAISE EXCEPTION 'legacy/new scope lost'; END IF;
 FOREACH receipt IN ARRAY ARRAY[other_channel,other_workspace,other_owner] LOOP
   IF public.public_calendar_write('scoped',receipt,'comment','hello','Test')->>'error' IS DISTINCT FROM  'post_not_found' THEN RAISE EXCEPTION 'R4 scope failure'; END IF;
   IF public.public_calendar_write('scoped',receipt,'status','draft_ready')->>'error' IS DISTINCT FROM  'post_not_found' THEN RAISE EXCEPTION 'R5 scope failure'; END IF;
 END LOOP;
 IF public.public_calendar_write('personal',p,'comment','hello','Test')->>'error' IS DISTINCT FROM  'post_not_found' THEN RAISE EXCEPTION 'personal crosses workspace'; END IF;
 IF public.public_calendar_write('personal',personal,'comment','hello','Test')->>'id' IS NULL THEN RAISE EXCEPTION 'personal blocked'; END IF;
 IF public.public_calendar_write('legacy',other_workspace,'comment','legacy permission','Test')->>'id' IS NULL THEN RAISE EXCEPTION 'legacy scope blocked'; END IF;
 BEGIN
  INSERT INTO public.calendar_shares(user_id,share_token,legacy_owner_scope) VALUES(u,'forged-legacy',true);
  RAISE EXCEPTION 'new link forged historical scope';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE public.calendar_shares SET legacy_owner_scope=true WHERE share_token='personal';
  RAISE EXCEPTION 'personal scope widened';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 receipt:=gen_random_uuid();
 r:=public.public_calendar_write('scoped',p,'comment','hello','Test',receipt);
 IF r->>'id' IS NULL OR public.public_calendar_write('scoped',p,'comment','hello','Test',receipt)->>'id' <> r->>'id' THEN RAISE EXCEPTION 'replay failed'; END IF;
 IF (SELECT count(*) FROM public.calendar_comments WHERE request_id=receipt)<>1 THEN RAISE EXCEPTION 'duplicate'; END IF;
 IF public.public_calendar_write('scoped',p,'comment','changed','Test',receipt)->>'error' IS DISTINCT FROM 'request_conflict' THEN RAISE EXCEPTION 'payload mismatch'; END IF;
 IF public.public_calendar_write('scoped',p,'wording','flatten')->>'error' IS DISTINCT FROM 'structured_content_required' THEN RAISE EXCEPTION 'flatten allowed'; END IF;
 IF public.public_calendar_write('scoped',p,'wording','[{"title":"New","image":"changed.png","id":"same"}]')->>'error' IS DISTINCT FROM 'structured_content_required' THEN RAISE EXCEPTION 'media changed'; END IF;
 r:=public.public_calendar_write('scoped',p,'wording','[{"title":"New","image":"keep.png","id":"same"}]');
 IF r->>'success' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'structured edit refused %',r; END IF;
 IF (SELECT content_data FROM public.calendar_posts WHERE id=p)<>'{"slides":[1,2]}'::jsonb OR (SELECT media_urls FROM public.calendar_posts WHERE id=p)<>'["photo.png"]'::jsonb THEN RAISE EXCEPTION 'other content lost'; END IF;
 IF public.public_calendar_write('scoped',p,'wording','[{"title":"Another","image":"keep.png","id":"same"}]',NULL,NULL,t)->>'error' IS DISTINCT FROM 'conflict' THEN RAISE EXCEPTION 'stale edit allowed'; END IF;
 -- A public projected draft omits crosspost provenance; editing restores it unchanged.
 UPDATE public.calendar_posts SET content_draft='{"caption":"Target","_crosspost":{"source_text":"secret","result":{"versions":{"linkedin":"private"}}}}' WHERE id=p;
 r:=public.public_calendar_write('scoped',p,'wording','{"caption":"Edited target"}');
 IF r->>'success' IS DISTINCT FROM 'true' OR (SELECT content_draft::jsonb->'_crosspost'->>'source_text' FROM public.calendar_posts WHERE id=p)<>'secret' THEN RAISE EXCEPTION 'private provenance lost'; END IF;
 IF public.public_calendar_write('scoped',p,'wording','{"caption":"Edited target"}',NULL,NULL,t)->>'success' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'structured retry failed'; END IF;
 -- Historical wrapper: full_content is target text, source/result stay private.
 UPDATE public.calendar_posts SET content_draft='{"type":"crosspost","target_channel":"instagram","full_content":"Target","source_text":"Legacy source","result":{"versions":{"linkedin":"private"}}}' WHERE id=p;
 r:=public.public_calendar_write('scoped',p,'wording','{"type":"crosspost","target_channel":"instagram","full_content":"Edited legacy target"}');
 IF r->>'success' IS DISTINCT FROM 'true' OR (SELECT content_draft::jsonb->>'source_text' FROM public.calendar_posts WHERE id=p) IS DISTINCT FROM 'Legacy source' OR (SELECT content_draft::jsonb->>'full_content' FROM public.calendar_posts WHERE id=p) IS DISTINCT FROM 'Edited legacy target' THEN RAISE EXCEPTION 'legacy wrapper edit lost target or source'; END IF;
 -- Audit log failure must roll the edit back, not return a false success.
 CREATE FUNCTION public.reject_test_log() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN IF NEW.content LIKE '[EDIT]%' THEN RAISE EXCEPTION 'synthetic log failure'; END IF; RETURN NEW; END $body$;
 CREATE TRIGGER reject_test_log BEFORE INSERT ON public.calendar_comments FOR EACH ROW EXECUTE FUNCTION public.reject_test_log();
 BEGIN
  PERFORM public.public_calendar_write('scoped',p,'status','draft_ready');
  RAISE EXCEPTION 'expected log failure';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'synthetic log failure' THEN RAISE; END IF;
 END;
 IF (SELECT status FROM public.calendar_posts WHERE id=p)<>'ready' THEN RAISE EXCEPTION 'non atomic edit'; END IF;
 DROP TRIGGER reject_test_log ON public.calendar_comments;
 r:=public.public_calendar_write('scoped',p,'status','draft_ready');
 IF r->>'success' IS DISTINCT FROM 'true' OR NOT EXISTS (SELECT FROM public.calendar_comments WHERE calendar_post_id=p AND content='[EDIT] Statut changé de "À valider" à "Validé"') THEN RAISE EXCEPTION 'before/after audit lost'; END IF;
 UPDATE public.calendar_shares SET show_content_draft=false WHERE share_token='scoped';
 IF public.public_calendar_write('scoped',p,NULL,'text')->>'error' IS DISTINCT FROM 'invalid_field' THEN RAISE EXCEPTION 'null action bypassed permissions'; END IF;
 IF public.public_calendar_write('scoped',p,'wording','text')->>'error' IS DISTINCT FROM 'permission_denied' THEN RAISE EXCEPTION 'hidden wording editable'; END IF;
 UPDATE public.calendar_shares SET guest_can_edit_status=false WHERE share_token='scoped';
 IF public.public_calendar_write('scoped',p,'status','draft_ready')->>'error' IS DISTINCT FROM 'permission_denied' THEN RAISE EXCEPTION 'status permission'; END IF;
 UPDATE public.calendar_shares SET expires_at=now() WHERE share_token='scoped';
 IF public.public_calendar_write('scoped',p,'comment','hello','Test')->>'error' IS DISTINCT FROM 'expired' THEN RAISE EXCEPTION 'expiration'; END IF;
 UPDATE public.calendar_shares SET is_active=false WHERE share_token='scoped';
 IF public.public_calendar_write('scoped',p,'comment','hello','Test')->>'error' IS DISTINCT FROM 'invalid_token' THEN RAISE EXCEPTION 'revocation'; END IF;
 IF has_function_privilege('anon','public.public_calendar_write(text,uuid,text,text,text,uuid,timestamptz)','EXECUTE') OR has_function_privilege('authenticated','public.public_calendar_write(text,uuid,text,text,text,uuid,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'RPC exposed'; END IF;
 IF NOT has_function_privilege('service_role','public.public_calendar_write(text,uuid,text,text,text,uuid,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'service missing'; END IF;
END $$;
-- Authenticated owner: same existing permission, now constrained to the chosen link.
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000001',true);
UPDATE public.calendar_shares SET is_active=true,expires_at=NULL WHERE share_token='scoped';
SET LOCAL ROLE authenticated;
DO $$
DECLARE s uuid; p uuid; other uuid;
BEGIN
 SELECT id INTO s FROM public.calendar_shares WHERE share_token='scoped';
 SELECT id INTO p FROM public.calendar_posts WHERE content_draft IS NOT NULL;
 SELECT id INTO other FROM public.calendar_posts WHERE canal='linkedin';
 INSERT INTO public.calendar_comments(calendar_post_id,share_id,author_name,author_role,content) VALUES(p,s,'Owner','owner','In scope');
 BEGIN
  INSERT INTO public.calendar_comments(calendar_post_id,share_id,author_name,author_role,content) VALUES(other,s,'Owner','owner','Out of scope');
  RAISE EXCEPTION 'owner bypassed link scope';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000002',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 BEGIN
  INSERT INTO public.calendar_comments(calendar_post_id,share_id,author_name,author_role,content)
  SELECT p.id,s.id,'Other','owner','Forbidden' FROM public.calendar_posts p,public.calendar_shares s WHERE p.content_draft IS NOT NULL AND s.share_token='scoped';
  RAISE EXCEPTION 'non-owner gained comment write permission';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
