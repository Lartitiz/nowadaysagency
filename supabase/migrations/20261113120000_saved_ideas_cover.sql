-- Vignette des contenus dans « Mes idées » (13/11/2026).
-- La liste ne lit jamais content_data (trop lourd, cf. 20261004170000) :
-- une colonne légère `cover` garde, à chaque enregistrement du contenu,
-- de quoi dessiner la première image, comme sur Canva :
--   {"kind":"slide","html":"<slide 1>","count":N}  carrousel avec visuels
--   {"kind":"story","story":{…story 1…},"count":N}  série de stories
-- Les photos des slides sont des liens depuis carousel-media.ts : la slide 1
-- pèse quelques Ko. Au-delà de 150 Ko (anciennes photos collées en base64),
-- pas de vignette : la liste garde la carte texte.

CREATE OR REPLACE FUNCTION public.saved_idea_cover_of(p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  d jsonb := p_data #> '{}';
  html text;
  story jsonb;
BEGIN
  IF jsonb_typeof(d) = 'string' THEN
    BEGIN d := (d #>> '{}')::jsonb; EXCEPTION WHEN others THEN d := NULL; END;
  END IF;
  IF jsonb_typeof(d) IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
  IF jsonb_typeof(d -> 'visual_html') = 'array' AND jsonb_array_length(d -> 'visual_html') > 0 THEN
    html := d #>> '{visual_html,0,html}';
    IF html IS NOT NULL AND btrim(html) <> '' AND length(html) <= 150000 THEN
      RETURN jsonb_build_object('kind', 'slide', 'html', html, 'count', jsonb_array_length(d -> 'visual_html'));
    END IF;
    RETURN NULL;
  END IF;
  IF jsonb_typeof(d -> 'stories') = 'array' AND jsonb_array_length(d -> 'stories') > 0 THEN
    story := d #> '{stories,0}';
    IF jsonb_typeof(story) = 'object' AND length(story::text) <= 150000 THEN
      RETURN jsonb_build_object('kind', 'story', 'story', story, 'count', jsonb_array_length(d -> 'stories'));
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

ALTER TABLE public.saved_ideas ADD COLUMN IF NOT EXISTS cover jsonb;

CREATE OR REPLACE FUNCTION public.saved_ideas_fill_preview()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  d jsonb := NEW.content_data #> '{}';
BEGIN
  NEW.preview := public.saved_idea_preview_of(d);
  NEW.preview_draft := left(NEW.content_draft, 600);
  NEW.has_content := public.saved_idea_has_content(d, NEW.content_draft);
  NEW.cover := public.saved_idea_cover_of(d);
  RETURN NEW;
END;
$$;

-- Remplissage des contenus existants, sans toucher à updated_at (sinon tout
-- semblerait « repris aujourd'hui » et le placement au calendrier verrait de
-- faux conflits). Seules les fiches qui ont des visuels ou des stories.
SET statement_timeout = '10min';
ALTER TABLE public.saved_ideas DISABLE TRIGGER update_saved_ideas_updated_at;
UPDATE public.saved_ideas SET cover = public.saved_idea_cover_of(content_data)
WHERE content_data IS NOT NULL
  AND (content_data::text LIKE '%"visual_html"%' OR content_data::text LIKE '%"stories"%');
ALTER TABLE public.saved_ideas ENABLE TRIGGER update_saved_ideas_updated_at;
