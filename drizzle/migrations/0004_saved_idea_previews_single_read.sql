-- saved_idea_previews lit chaque contenu une seule fois.
-- La version du 20261004130000 laissait la variable pointer vers la valeur
-- stockée : chaque extraction relisait tout le contenu (jusqu'à ~8 Mo par
-- idée), d'où 8,4 s et un HTTP 500 sur l'espace le plus lourd. Seule cette
-- fonction change ; les deux fonctions utilitaires restent identiques.

CREATE OR REPLACE FUNCTION public.saved_idea_previews(p_ids uuid[])
RETURNS TABLE(id uuid, preview jsonb, draft_head text)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  r record;
  d jsonb;
BEGIN
  IF coalesce(array_length(p_ids, 1), 0) > 100 THEN
    RAISE EXCEPTION 'too_many_ids';
  END IF;
  FOR r IN
    -- `#> '{}'` renvoie le document entier, mais déjà lu en mémoire : sans
    -- cela, chaque extraction ci-dessous relisait tout le contenu stocké
    -- (17 fois plus de lectures mesurées, 8,4 s puis HTTP 500 en ligne).
    SELECT si.id AS idea_id, si.content_data #> '{}' AS content_data, left(si.content_draft, 600) AS head
    FROM public.saved_ideas si WHERE si.id = ANY(p_ids)
  LOOP
    d := r.content_data;
    IF jsonb_typeof(d) = 'string' THEN
      BEGIN d := (d #>> '{}')::jsonb; EXCEPTION WHEN others THEN d := NULL; END;
    END IF;
    IF jsonb_typeof(d) IS DISTINCT FROM 'object' THEN d := NULL; END IF;
    id := r.idea_id;
    draft_head := r.head;
    preview := CASE WHEN d IS NULL THEN NULL ELSE jsonb_strip_nulls(jsonb_build_object(
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
    )) END;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.saved_idea_previews(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.saved_idea_previews(uuid[]) TO authenticated;