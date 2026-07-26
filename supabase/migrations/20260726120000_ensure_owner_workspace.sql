-- ============================================================================
-- Filet anti « membership owner manquante » (famille de bug « Camille », 26/07)
-- ----------------------------------------------------------------------------
-- Contexte : le bootstrap d'un·e utilisateur·ice (workspace + workspace_members
-- role=owner) n'existe QUE dans le trigger `create_default_tasks()` qui tire une
-- seule fois, à l'INSERT de `profiles`. Il n'y a AUCUN trigger sur auth.users et
-- AUCUNE réconciliation ensuite. Si la ligne owner manque (échec partiel du
-- bootstrap au signup, ou suppression ultérieure), l'app reste bloquée à vie :
-- activeWorkspace=null → section Membres absente, /photos inerte, facturation qui
-- retombe en périmètre user. Ce fichier pose deux garde-fous :
--   1) `ensure_owner_workspace()` : RPC idempotent que le front peut appeler pour
--      s'auto-réparer (recrée l'espace owner du CALLER si absent). auth.uid() only
--      → aucune escalade de privilège possible.
--   2) backfill : répare immédiatement tou·te·s les orphelin·es déjà en base.
-- ============================================================================

-- 1) RPC d'auto-réparation ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_owner_workspace()
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  _uid    uuid := auth.uid();
  _ws_id  uuid;
  _prenom text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'ensure_owner_workspace: not authenticated';
  END IF;

  -- Déjà un espace owner ? On le renvoie tel quel — idempotent, rien à créer.
  SELECT workspace_id INTO _ws_id
  FROM public.workspace_members
  WHERE user_id = _uid AND role = 'owner'
  ORDER BY joined_at ASC
  LIMIT 1;

  IF _ws_id IS NOT NULL THEN
    RETURN _ws_id;
  END IF;

  -- Sinon on recrée l'espace + la membership owner, à l'identique du trigger
  -- de bootstrap `create_default_tasks()`.
  SELECT prenom INTO _prenom FROM public.profiles WHERE user_id = _uid;

  INSERT INTO public.workspaces (name, created_by)
  VALUES (COALESCE(_prenom, 'Mon espace'), _uid)
  RETURNING id INTO _ws_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (_ws_id, _uid, 'owner');

  RAISE NOTICE 'ensure_owner_workspace: espace owner recréé pour % (ws=%)', _uid, _ws_id;
  RETURN _ws_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ensure_owner_workspace() TO authenticated;

-- 2) Backfill immédiat des orphelin·es --------------------------------------
--    Toute personne avec un profil mais sans espace owner en reçoit un.
DO $backfill$
DECLARE
  _rec   record;
  _ws_id uuid;
  _count int := 0;
BEGIN
  FOR _rec IN
    SELECT p.user_id, p.prenom
    FROM public.profiles p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.workspace_members m
      WHERE m.user_id = p.user_id AND m.role = 'owner'
    )
  LOOP
    INSERT INTO public.workspaces (name, created_by)
    VALUES (COALESCE(_rec.prenom, 'Mon espace'), _rec.user_id)
    RETURNING id INTO _ws_id;

    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (_ws_id, _rec.user_id, 'owner');

    _count := _count + 1;
  END LOOP;

  RAISE NOTICE 'Backfill ensure_owner_workspace : % espace(s) owner recréé(s).', _count;
END;
$backfill$;
