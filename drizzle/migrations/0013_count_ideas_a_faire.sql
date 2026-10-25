-- Compteur « Accéder à mes idées (N) » de l'accueil (src/hooks/use-ideas-todo-count.ts).
--
-- Pourquoi : le front comptait par `HEAD saved_ideas?count=exact` sous RLS. La policy
-- `workspace_select_saved_ideas` appelle la fonction plpgsql user_has_workspace_access()
-- LIGNE PAR LIGNE (~500 idées de ~50 Ko pour le compte test) : c'était la lecture la plus
-- lourde de l'accueil (2 à 5 fois les autres compteurs, jusqu'à 0,8 s au calme) et la
-- première à dépasser le statement_timeout de 8 s du rôle authenticated les matins où la
-- base est saturée → HTTP 500 (HEAD : sans corps) + bandeau « données incomplètes »
-- (vu les 21, 23 et 25/10/2026 par la visite du matin).
--
-- Remède : un seul contrôle d'accès (même garde que get_dashboard_summary), puis un
-- count(*) exécuté par le propriétaire (SECURITY DEFINER = pas de RLS ligne à ligne)
-- sur un index partiel couvrant. Le front retombe sur l'ancienne requête tant que cette
-- fonction n'est pas en base (PGRST202) : l'ordre merge/migration n'a pas d'importance.
-- Ne touche à aucune policy existante.

CREATE INDEX IF NOT EXISTS idx_saved_ideas_a_faire
  ON public.saved_ideas (workspace_id) INCLUDE (user_id, status)
  WHERE calendar_post_id IS NULL;

CREATE OR REPLACE FUNCTION public.count_ideas_a_faire(p_workspace_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_workspace_id IS NOT NULL THEN
    -- Même garde que les policies RLS de saved_ideas, évaluée UNE fois.
    IF NOT public.user_has_workspace_access(p_workspace_id) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    SELECT count(*) INTO n
    FROM public.saved_ideas
    WHERE workspace_id = p_workspace_id
      AND calendar_post_id IS NULL
      AND (status IS NULL OR status NOT IN ('planned', 'published'));
  ELSE
    -- Compte sans espace (cas historique) : ses propres idées seulement.
    SELECT count(*) INTO n
    FROM public.saved_ideas
    WHERE user_id = auth.uid()
      AND calendar_post_id IS NULL
      AND (status IS NULL OR status NOT IN ('planned', 'published'));
  END IF;

  RETURN coalesce(n, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.count_ideas_a_faire(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_ideas_a_faire(uuid) TO authenticated;
