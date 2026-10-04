-- Aperçus légers des idées pour la page « Mes idées ».
-- Certaines idées portent plusieurs Mo dans content_data (images collées en
-- data:image) : lire toute la liste avec son contenu dépassait le délai de
-- PostgREST (HTTP 500, « Thread killed by timeout manager »). La page lit
-- désormais une liste sans contenu, puis ce résumé de quelques centaines de
-- caractères par idée. SECURITY INVOKER : les règles RLS de saved_ideas
-- s'appliquent telles quelles.

CREATE OR REPLACE FUNCTION public.saved_idea_preview_text(v jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN jsonb_typeof(v) = 'string' THEN to_jsonb(left(v #>> '{}', 400)) END;
$$;

CREATE OR REPLACE FUNCTION public.saved_idea_preview_pick(o jsonb, keys text[])
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN jsonb_typeof(o) = 'object' THEN coalesce(
    (SELECT jsonb_object_agg(k, to_jsonb(left(o ->> k, 400))) FROM unnest(keys) AS k WHERE jsonb_typeof(o -> k) = 'string'),
    '{}'::jsonb) END;
$$;

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
    SELECT si.id AS idea_id, si.content_data, left(si.content_draft, 600) AS head
    FROM public.saved_ideas si WHERE si.id = ANY(p_ids)
  LOOP
    -- L'affectation à une variable décompresse la valeur une seule fois.
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
