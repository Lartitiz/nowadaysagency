\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TABLE public.saved_ideas(id uuid PRIMARY KEY, notes text, content_data jsonb, content_draft text, updated_at timestamptz DEFAULT now());
CREATE TRIGGER update_saved_ideas_updated_at BEFORE UPDATE ON public.saved_ideas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- Idées existantes avant la migration (dates anciennes à préserver).
INSERT INTO public.saved_ideas VALUES
 ('00000000-0000-0000-0000-000000000001', NULL, jsonb_build_object('slides', jsonb_build_array(jsonb_build_object('title', 'Titre', 'html', 'data:image/png;base64,' || repeat('A', 2000000)))), NULL, '2026-09-01'),
 ('00000000-0000-0000-0000-000000000002', NULL, '{}', '   ', '2026-09-02'),
 ('00000000-0000-0000-0000-000000000003', NULL, NULL, 'SLIDE 1 : Brouillon', '2026-09-03'),
 ('00000000-0000-0000-0000-000000000004', NULL, '"texte"', NULL, '2026-09-04'),
 ('00000000-0000-0000-0000-000000000005', NULL, '[]', NULL, '2026-09-05'),
 ('00000000-0000-0000-0000-000000000006', NULL, 'null', NULL, '2026-09-06');
\ir ../migrations/20261004130000_saved_idea_previews.sql
\ir ../migrations/20261004150000_saved_idea_previews_single_read.sql
\ir ../migrations/20261004170000_saved_ideas_stored_preview.sql
DO $$ DECLARE r record; BEGIN
  -- Remplissage : aperçus calculés, dates inchangées.
  IF EXISTS (SELECT 1 FROM saved_ideas WHERE updated_at <> ('2026-09-0' || right(id::text, 1))::timestamptz) THEN RAISE EXCEPTION 'backfill changed updated_at'; END IF;
  SELECT * INTO r FROM saved_ideas WHERE id = '00000000-0000-0000-0000-000000000001';
  IF r.preview <> '{"slides":[{"title":"Titre"}]}'::jsonb OR NOT r.has_content THEN RAISE EXCEPTION 'backfill preview %', r.preview; END IF;
  -- has_content : même règle que hasContent() côté écran.
  IF (SELECT array_agg(has_content ORDER BY id) FROM saved_ideas) <> ARRAY[true, false, true, true, false, false] THEN
    RAISE EXCEPTION 'has_content %', (SELECT array_agg(has_content ORDER BY id) FROM saved_ideas);
  END IF;
  IF (SELECT preview_draft FROM saved_ideas WHERE id = '00000000-0000-0000-0000-000000000003') <> 'SLIDE 1 : Brouillon' THEN RAISE EXCEPTION 'preview_draft'; END IF;
END $$;
-- Une nouvelle idée et une modification du contenu recalculent l'aperçu.
INSERT INTO saved_ideas(id, content_data) VALUES ('00000000-0000-0000-0000-000000000007', '{"edited_text":"Nouveau"}');
UPDATE saved_ideas SET content_data = '{"hook":"Accroche"}' WHERE id = '00000000-0000-0000-0000-000000000002';
UPDATE saved_ideas SET content_draft = repeat('x', 5000) WHERE id = '00000000-0000-0000-0000-000000000006';
-- Modifier seulement les notes garde l'aperçu et relance bien updated_at.
UPDATE saved_ideas SET notes = 'note' WHERE id = '00000000-0000-0000-0000-000000000001';
DO $$ BEGIN
  IF (SELECT preview->>'edited_text' FROM saved_ideas WHERE id = '00000000-0000-0000-0000-000000000007') <> 'Nouveau' THEN RAISE EXCEPTION 'insert preview'; END IF;
  IF (SELECT preview FROM saved_ideas WHERE id = '00000000-0000-0000-0000-000000000002') <> '{"hook":"Accroche"}' THEN RAISE EXCEPTION 'update preview'; END IF;
  IF NOT (SELECT has_content FROM saved_ideas WHERE id = '00000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'update has_content'; END IF;
  IF (SELECT length(preview_draft) FROM saved_ideas WHERE id = '00000000-0000-0000-0000-000000000006') <> 600 THEN RAISE EXCEPTION 'draft not truncated'; END IF;
  IF (SELECT preview FROM saved_ideas WHERE id = '00000000-0000-0000-0000-000000000001') <> '{"slides":[{"title":"Titre"}]}'::jsonb THEN RAISE EXCEPTION 'notes update lost preview'; END IF;
  IF (SELECT updated_at FROM saved_ideas WHERE id = '00000000-0000-0000-0000-000000000001') = '2026-09-01' THEN RAISE EXCEPTION 'updated_at trigger left disabled'; END IF;
END $$;
ROLLBACK;
