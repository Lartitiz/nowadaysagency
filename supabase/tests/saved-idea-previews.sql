\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA IF NOT EXISTS auth;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.saved_ideas(id uuid PRIMARY KEY, user_id uuid NOT NULL, content_data jsonb, content_draft text);
ALTER TABLE public.saved_ideas ENABLE ROW LEVEL SECURITY;
CREATE POLICY own ON public.saved_ideas FOR SELECT TO authenticated USING (auth.uid() = user_id);
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT ON public.saved_ideas TO authenticated;
\ir ../migrations/20261004130000_saved_idea_previews.sql
\ir ../migrations/20261004150000_saved_idea_previews_single_read.sql
-- Une idée de plusieurs Mo (images collées) ne renvoie qu'un extrait de texte.
INSERT INTO public.saved_ideas VALUES
 ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001',
  jsonb_build_object('slides', jsonb_build_array(jsonb_build_object('title', 'Titre slide', 'html', 'data:image/png;base64,' || repeat('A', 3000000))),
                     'visual_urls', jsonb_build_array('data:image/png;base64,' || repeat('B', 3000000))), NULL),
 ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000001',
  to_jsonb('{"edited_text":"Texte édité","script":[{"section":"hook","texte_parle":"Accroche"}]}'::text), 'Brouillon ' || repeat('x', 100000)),
 ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000002', '{"body":"secret"}', 'secret');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
DO $$ DECLARE r record; BEGIN
  SELECT * INTO r FROM public.saved_idea_previews(ARRAY['00000000-0000-0000-0000-0000000000a1'::uuid]);
  IF r.preview <> '{"slides":[{"title":"Titre slide"}]}'::jsonb THEN RAISE EXCEPTION 'unexpected preview %', r.preview; END IF;
  SELECT * INTO r FROM public.saved_idea_previews(ARRAY['00000000-0000-0000-0000-0000000000a2'::uuid]);
  IF r.preview->>'edited_text' <> 'Texte édité' OR r.preview#>>'{script,0,texte_parle}' <> 'Accroche' THEN RAISE EXCEPTION 'string json not parsed %', r.preview; END IF;
  IF length(r.draft_head) <> 600 THEN RAISE EXCEPTION 'draft not truncated'; END IF;
  -- RLS : l'idée d'une autre personne n'est jamais renvoyée.
  IF EXISTS (SELECT 1 FROM public.saved_idea_previews(ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid])) THEN RAISE EXCEPTION 'rls bypassed'; END IF;
END $$;
DO $$ BEGIN
  PERFORM * FROM public.saved_idea_previews(ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 101)));
  RAISE EXCEPTION 'limit not enforced';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'too_many_ids' THEN RAISE; END IF;
END $$;
ROLLBACK;
