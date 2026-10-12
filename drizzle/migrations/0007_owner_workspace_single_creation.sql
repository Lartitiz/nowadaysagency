CREATE OR REPLACE FUNCTION public.create_default_tasks()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  ws_id UUID;
BEGIN
  INSERT INTO public.tasks (user_id, label, duration_minutes, period, order_index) VALUES
    (NEW.user_id, 'Définir mes piliers de contenu', 30, 'week', 1),
    (NEW.user_id, 'Rédiger 2 posts Instagram', 45, 'week', 2),
    (NEW.user_id, 'Planifier ma semaine de stories', 20, 'week', 3),
    (NEW.user_id, 'Créer mon calendrier éditorial', 60, 'month', 1),
    (NEW.user_id, 'Optimiser ma bio Instagram', 20, 'month', 2),
    (NEW.user_id, 'Définir ma cliente idéale en détail', 30, 'month', 3),
    (NEW.user_id, 'Écrire mon storytelling de marque', 45, 'month', 4);

  -- Même verrou que ensure_owner_workspace() : un seul créateur à la fois.
  PERFORM pg_advisory_xact_lock(hashtextextended('owner_workspace:' || NEW.user_id::text, 0));

  -- Espace owner déjà créé (auto-réparation passée avant) → ne pas en refaire un.
  IF EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = NEW.user_id AND role = 'owner'
  ) THEN
    RETURN NEW;
  END IF;

  -- Créer un workspace par défaut
  INSERT INTO public.workspaces (name, created_by)
  VALUES (COALESCE(NEW.prenom, 'Mon espace'), NEW.user_id)
  RETURNING id INTO ws_id;

  -- Ajouter l'utilisateur comme owner
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (ws_id, NEW.user_id, 'owner');

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_owner_workspace()
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _ws_id uuid; _prenom text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'ensure_owner_workspace: not authenticated'; END IF;
  -- Attend la fin d'un insert profiles concurrent (trigger ci-dessus).
  PERFORM pg_advisory_xact_lock(hashtextextended('owner_workspace:' || _uid::text, 0));
  SELECT workspace_id INTO _ws_id FROM public.workspace_members
    WHERE user_id = _uid AND role = 'owner' ORDER BY joined_at ASC LIMIT 1;
  IF _ws_id IS NOT NULL THEN RETURN _ws_id; END IF;
  SELECT prenom INTO _prenom FROM public.profiles WHERE user_id = _uid;
  INSERT INTO public.workspaces (name, created_by) VALUES (COALESCE(_prenom,'Mon espace'), _uid) RETURNING id INTO _ws_id;
  INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES (_ws_id, _uid, 'owner');
  RETURN _ws_id;
END; $function$;

GRANT EXECUTE ON FUNCTION public.ensure_owner_workspace() TO authenticated;