\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TABLE public.saved_ideas(id uuid PRIMARY KEY, user_id uuid, notes text, content_data jsonb, content_draft text, updated_at timestamptz DEFAULT now());
CREATE TABLE public.calendar_posts(id uuid PRIMARY KEY, user_id uuid, story_sequence_detail jsonb, updated_at timestamptz DEFAULT now());
CREATE TRIGGER update_saved_ideas_updated_at BEFORE UPDATE ON public.saved_ideas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_calendar_posts_updated_at BEFORE UPDATE ON public.calendar_posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.saved_ideas VALUES
 ('00000000-0000-0000-0000-000000000001', NULL, NULL, jsonb_build_object('html', 'data:image/jpeg;base64,' || (SELECT string_agg(md5(random()::text || g), '') FROM generate_series(1, 3000) g)), 'brouillon', '2026-09-01'),
 ('00000000-0000-0000-0000-000000000002', NULL, NULL, '{"html":"court"}', NULL, '2026-09-02'),
 ('00000000-0000-0000-0000-000000000003', NULL, NULL, jsonb_build_object('html', 'data:image/jpeg;base64,' || (SELECT string_agg(md5(random()::text || g), '') FROM generate_series(1, 3000) g)), NULL, '2026-09-03');
INSERT INTO public.calendar_posts VALUES ('00000000-0000-0000-0000-0000000000c1', NULL, jsonb_build_object('slides', 'data:image/jpeg;base64,' || (SELECT string_agg(md5(random()::text || g), '') FROM generate_series(1, 3000) g)), '2026-09-04');
\ir ../migrations/20261004200000_carousel_media_backfill.sql
DO $$ DECLARE ok boolean; BEGIN
  -- Seules les lignes lourdes sont candidates.
  IF (SELECT array_agg(id ORDER BY id) FROM public.carousel_media_candidates('saved_ideas', NULL, 10)) <> ARRAY['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003']::uuid[] THEN RAISE EXCEPTION 'candidates'; END IF;
  IF (SELECT count(*) FROM public.carousel_media_candidates('saved_ideas', '00000000-0000-0000-0000-000000000001', 10)) <> 1 THEN RAISE EXCEPTION 'cursor'; END IF;
  IF (SELECT count(*) FROM public.carousel_media_candidates('calendar_posts', NULL, 10)) <> 1 THEN RAISE EXCEPTION 'calendar candidates'; END IF;
  -- Conversion : contenu remplacé, date intacte, original sauvegardé.
  ok := public.apply_carousel_media_backfill('saved_ideas', '00000000-0000-0000-0000-000000000001', '2026-09-01', '{"content_data":{"html":"https://x/carousel-media/a.jpg"}}');
  IF NOT ok THEN RAISE EXCEPTION 'not applied'; END IF;
  IF (SELECT content_data->>'html' FROM saved_ideas WHERE id = '00000000-0000-0000-0000-000000000001') <> 'https://x/carousel-media/a.jpg' THEN RAISE EXCEPTION 'content not replaced'; END IF;
  IF (SELECT content_draft FROM saved_ideas WHERE id = '00000000-0000-0000-0000-000000000001') <> 'brouillon' THEN RAISE EXCEPTION 'untouched column changed'; END IF;
  IF (SELECT updated_at FROM saved_ideas WHERE id = '00000000-0000-0000-0000-000000000001') <> '2026-09-01' THEN RAISE EXCEPTION 'updated_at moved'; END IF;
  IF (SELECT original->'content_data'->>'html' FROM carousel_media_backfill_backup WHERE row_id = '00000000-0000-0000-0000-000000000001') NOT LIKE 'data:image/jpeg;base64,%' THEN RAISE EXCEPTION 'backup missing'; END IF;
  -- Une ligne modifiée entre-temps n'est pas touchée.
  ok := public.apply_carousel_media_backfill('saved_ideas', '00000000-0000-0000-0000-000000000003', '2020-01-01', '{"content_data":{"html":"x"}}');
  IF ok OR (SELECT content_data->>'html' FROM saved_ideas WHERE id = '00000000-0000-0000-0000-000000000003') = 'x' THEN RAISE EXCEPTION 'conflict overwritten'; END IF;
  IF EXISTS (SELECT 1 FROM carousel_media_backfill_backup WHERE row_id = '00000000-0000-0000-0000-000000000003') THEN RAISE EXCEPTION 'backup on conflict'; END IF;
  -- Calendrier.
  ok := public.apply_carousel_media_backfill('calendar_posts', '00000000-0000-0000-0000-0000000000c1', '2026-09-04', '{"story_sequence_detail":{"slides":"https://x/b.jpg"}}');
  IF NOT ok OR (SELECT updated_at FROM calendar_posts) <> '2026-09-04' THEN RAISE EXCEPTION 'calendar'; END IF;
END $$;
-- Hors conversion, une modification normale fait toujours avancer la date.
UPDATE saved_ideas SET notes = 'n' WHERE id = '00000000-0000-0000-0000-000000000002';
DO $$ BEGIN
  IF (SELECT updated_at FROM saved_ideas WHERE id = '00000000-0000-0000-0000-000000000002') = '2026-09-02' THEN RAISE EXCEPTION 'normal updated_at broken'; END IF;
  IF has_function_privilege('authenticated', 'public.apply_carousel_media_backfill(text, uuid, timestamptz, jsonb)', 'EXECUTE') THEN RAISE EXCEPTION 'authenticated can apply'; END IF;
  IF has_table_privilege('authenticated', 'public.carousel_media_backfill_backup', 'SELECT') THEN RAISE EXCEPTION 'backup readable'; END IF;
END $$;
ROLLBACK;
