-- Aperçu des idées préparé à l'enregistrement.
-- Les listes (« Mes idées », panneau du calendrier) lisaient l'aperçu en
-- relisant tout content_data (jusqu'à ~8 Mo par idée, images collées) : lent
-- et fragile. Désormais trois colonnes légères sont calculées à chaque
-- écriture du contenu, quel que soit l'endroit qui écrit (app ou fonction) :
--   preview        extrait de content_data (mêmes clés, textes ≤ 400 car., sans images)
--   preview_draft  début de content_draft (600 car.)
--   has_content    même règle que hasContent() dans src/lib/idea-state.ts

CREATE OR REPLACE FUNCTION public.saved_idea_preview_of(p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  -- `#> '{}'` : une seule lecture du document (sinon chaque `->` le relit).
  d jsonb := p_data #> '{}';
BEGIN
  IF jsonb_typeof(d) = 'string' THEN
    BEGIN d := (d #>> '{}')::jsonb; EXCEPTION WHEN others THEN d := NULL; END;
  END IF;
  IF jsonb_typeof(d) IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'edited_text', public.saved_idea_preview_text(d -> 'edited_text'),
    'chosen_angle', public.saved_idea_preview_pick(d -> 'chosen_angle', ARRAY['title', 'description']),
    'slides', CASE WHEN jsonb_typeof(d -> 'slides') = 'array' AND jsonb_array_length(d -> 'slides') > 0
      THEN jsonb_build_array(public.saved_idea_preview_pick(d #> '{slides,0}', ARRAY['hook', 'text', 'titre', 'title', 'body', 'caption', 'overlay_text'])) END,
    'stories', CASE WHEN jsonb_typeof(d -> 'stories') = 'array' AND jsonb_array_length(d -> 'stories') > 0
      THEN jsonb_build_array(public.saved_idea_preview_pick(d #> '{stories,0}', ARRAY['text', 'texte', 'hook', 'overlay_text', 'titre'])) END,
    'script', CASE WHEN jsonb_typeof(d -> 'script') = 'array' THEN (
      SELECT jsonb_build_array(jsonb_build_object('section', 'hook', 'texte_parle', public.saved_idea_preview_text(e -> 'texte_parle')))
      FROM jsonb_array_elements(d -> 'script') AS e WHERE e ->> 'section' = 'hook' LIMIT 1) END,
    'hook', CASE WHEN jsonb_typeof(d -> 'hook') = 'object'
      THEN public.saved_idea_preview_pick(d -> 'hook', ARRAY['texte_parle']) ELSE public.saved_idea_preview_text(d -> 'hook') END,
    'caption', CASE WHEN jsonb_typeof(d -> 'caption') = 'object'
      THEN public.saved_idea_preview_pick(d -> 'caption', ARRAY['hook', 'body', 'text']) ELSE public.saved_idea_preview_text(d -> 'caption') END,
    'body', public.saved_idea_preview_text(d -> 'body'),
    'content', public.saved_idea_preview_text(d -> 'content'),
    'resume', public.saved_idea_preview_text(d -> 'resume')
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.saved_idea_has_content(p_data jsonb, p_draft text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(btrim(p_draft), '') <> '' OR coalesce(CASE jsonb_typeof(p_data)
    WHEN 'string' THEN btrim(p_data #>> '{}') <> ''
    WHEN 'array' THEN jsonb_array_length(p_data) > 0
    WHEN 'object' THEN p_data <> '{}'::jsonb
    ELSE false END, false);
$$;

ALTER TABLE public.saved_ideas
  ADD COLUMN IF NOT EXISTS preview jsonb,
  ADD COLUMN IF NOT EXISTS preview_draft text,
  ADD COLUMN IF NOT EXISTS has_content boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.saved_ideas_fill_preview()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  d jsonb := NEW.content_data #> '{}';
BEGIN
  NEW.preview := public.saved_idea_preview_of(d);
  NEW.preview_draft := left(NEW.content_draft, 600);
  NEW.has_content := public.saved_idea_has_content(d, NEW.content_draft);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS saved_ideas_fill_preview ON public.saved_ideas;
CREATE TRIGGER saved_ideas_fill_preview
  BEFORE INSERT OR UPDATE OF content_data, content_draft ON public.saved_ideas
  FOR EACH ROW EXECUTE FUNCTION public.saved_ideas_fill_preview();

-- Remplissage des idées existantes, sans toucher à updated_at : sinon toutes
-- les idées sembleraient « reprises aujourd'hui » et le placement au
-- calendrier (p_expected_updated_at) signalerait de faux conflits.
-- Lecture unique de tout le contenu (~11 Mo/s en ligne) : plus que les 8 s
-- habituelles, d'où un délai relevé pour cette seule opération.
SET statement_timeout = '10min';
ALTER TABLE public.saved_ideas DISABLE TRIGGER update_saved_ideas_updated_at;
UPDATE public.saved_ideas SET content_draft = content_draft;
ALTER TABLE public.saved_ideas ENABLE TRIGGER update_saved_ideas_updated_at;
RESET statement_timeout;
