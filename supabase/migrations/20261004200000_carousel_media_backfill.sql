-- Conversion des contenus existants dont les photos sont collées en base64
-- (étape 3 du chantier images ; étapes 1-2 : #1331). L'edge function
-- carousel-media-backfill range chaque photo dans calendar-visuals, la relit,
-- puis appelle apply_carousel_media_backfill pour remplacer le contenu.
--
-- Garanties :
--  * le contenu d'origine est copié dans carousel_media_backfill_backup avant
--    tout remplacement (retour arrière possible ; table à supprimer une fois
--    la conversion vérifiée) ;
--  * updated_at ne bouge pas (sinon toutes les idées sembleraient « reprises
--    aujourd'hui » et plan_saved_idea signalerait de faux conflits) ;
--  * une ligne modifiée entre la lecture et l'écriture n'est pas touchée.

CREATE TABLE IF NOT EXISTS public.carousel_media_backfill_backup (
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  original jsonb NOT NULL,
  migrated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, row_id)
);
ALTER TABLE public.carousel_media_backfill_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.carousel_media_backfill_backup FROM PUBLIC, anon, authenticated;

-- Le trigger updated_at laisse la date intacte pendant une conversion technique.
-- Le réglage app.keep_updated_at n'est posé que par apply_carousel_media_backfill,
-- le temps de sa propre transaction.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('app.keep_updated_at', true) = 'on' THEN
    RETURN NEW;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Lignes candidates : taille stockée importante (pg_column_size ne relit pas
-- le contenu). Le contrôle exact des images se fait dans l'edge function.
CREATE OR REPLACE FUNCTION public.carousel_media_candidates(p_table text, p_after uuid, p_limit integer)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_table = 'saved_ideas' THEN
    RETURN QUERY SELECT s.id FROM public.saved_ideas s
      WHERE (p_after IS NULL OR s.id > p_after)
        AND (coalesce(pg_column_size(s.content_data), 0) > 30000 OR coalesce(pg_column_size(s.content_draft), 0) > 30000)
      ORDER BY s.id LIMIT greatest(1, least(p_limit, 50));
  ELSIF p_table = 'calendar_posts' THEN
    RETURN QUERY SELECT c.id FROM public.calendar_posts c
      WHERE (p_after IS NULL OR c.id > p_after)
        AND coalesce(pg_column_size(c.story_sequence_detail), 0) > 30000
      ORDER BY c.id LIMIT greatest(1, least(p_limit, 50));
  ELSE
    RAISE EXCEPTION 'table_not_allowed';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_carousel_media_backfill(
  p_table text, p_id uuid, p_expected timestamptz, p_values jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n integer := 0;
BEGIN
  PERFORM set_config('app.keep_updated_at', 'on', true);
  IF p_table = 'saved_ideas' THEN
    INSERT INTO public.carousel_media_backfill_backup(table_name, row_id, original)
      SELECT 'saved_ideas', s.id, jsonb_build_object('content_data', s.content_data, 'content_draft', to_jsonb(s.content_draft), 'updated_at', s.updated_at)
      FROM public.saved_ideas s WHERE s.id = p_id AND s.updated_at IS NOT DISTINCT FROM p_expected
      ON CONFLICT (table_name, row_id) DO NOTHING;
    UPDATE public.saved_ideas SET
      content_data = CASE WHEN p_values ? 'content_data' THEN p_values -> 'content_data' ELSE content_data END,
      content_draft = CASE WHEN p_values ? 'content_draft' THEN p_values ->> 'content_draft' ELSE content_draft END
    WHERE id = p_id AND updated_at IS NOT DISTINCT FROM p_expected;
    GET DIAGNOSTICS n = ROW_COUNT;
  ELSIF p_table = 'calendar_posts' THEN
    INSERT INTO public.carousel_media_backfill_backup(table_name, row_id, original)
      SELECT 'calendar_posts', c.id, jsonb_build_object('story_sequence_detail', c.story_sequence_detail, 'updated_at', c.updated_at)
      FROM public.calendar_posts c WHERE c.id = p_id AND c.updated_at IS NOT DISTINCT FROM p_expected
      ON CONFLICT (table_name, row_id) DO NOTHING;
    UPDATE public.calendar_posts SET
      story_sequence_detail = CASE WHEN p_values ? 'story_sequence_detail' THEN p_values -> 'story_sequence_detail' ELSE story_sequence_detail END
    WHERE id = p_id AND updated_at IS NOT DISTINCT FROM p_expected;
    GET DIAGNOSTICS n = ROW_COUNT;
  ELSE
    RAISE EXCEPTION 'table_not_allowed';
  END IF;
  PERFORM set_config('app.keep_updated_at', 'off', true);
  RETURN n = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.carousel_media_candidates(text, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_carousel_media_backfill(text, uuid, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carousel_media_candidates(text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_carousel_media_backfill(text, uuid, timestamptz, jsonb) TO service_role;
