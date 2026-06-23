UPDATE public.saved_ideas si
SET workspace_id = public.get_user_owner_workspace(si.user_id)
WHERE si.workspace_id IS NULL
  AND public.get_user_owner_workspace(si.user_id) IS NOT NULL;