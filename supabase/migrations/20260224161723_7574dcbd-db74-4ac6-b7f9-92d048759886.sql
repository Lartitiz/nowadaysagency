
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
