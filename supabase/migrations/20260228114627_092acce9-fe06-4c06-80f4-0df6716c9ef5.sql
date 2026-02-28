-- Backfill workspace_id for branding tables where it's NULL
-- For each user who has a workspace, set workspace_id on their orphaned rows

WITH user_workspaces AS (
  SELECT wm.user_id, wm.workspace_id
  FROM public.workspace_members wm
  WHERE wm.role = 'owner'
)
UPDATE public.persona p
SET workspace_id = uw.workspace_id
FROM user_workspaces uw
WHERE p.user_id = uw.user_id AND p.workspace_id IS NULL;

WITH user_workspaces AS (
  SELECT wm.user_id, wm.workspace_id
  FROM public.workspace_members wm
  WHERE wm.role = 'owner'
)
UPDATE public.storytelling s
SET workspace_id = uw.workspace_id
FROM user_workspaces uw
WHERE s.user_id = uw.user_id AND s.workspace_id IS NULL;

WITH user_workspaces AS (
  SELECT wm.user_id, wm.workspace_id
  FROM public.workspace_members wm
  WHERE wm.role = 'owner'
)
UPDATE public.brand_proposition bp
SET workspace_id = uw.workspace_id
FROM user_workspaces uw
WHERE bp.user_id = uw.user_id AND bp.workspace_id IS NULL;

WITH user_workspaces AS (
  SELECT wm.user_id, wm.workspace_id
  FROM public.workspace_members wm
  WHERE wm.role = 'owner'
)
UPDATE public.brand_profile bpr
SET workspace_id = uw.workspace_id
FROM user_workspaces uw
WHERE bpr.user_id = uw.user_id AND bpr.workspace_id IS NULL;

WITH user_workspaces AS (
  SELECT wm.user_id, wm.workspace_id
  FROM public.workspace_members wm
  WHERE wm.role = 'owner'
)
UPDATE public.brand_strategy bs
SET workspace_id = uw.workspace_id
FROM user_workspaces uw
WHERE bs.user_id = uw.user_id AND bs.workspace_id IS NULL;

WITH user_workspaces AS (
  SELECT wm.user_id, wm.workspace_id
  FROM public.workspace_members wm
  WHERE wm.role = 'owner'
)
UPDATE public.offers o
SET workspace_id = uw.workspace_id
FROM user_workspaces uw
WHERE o.user_id = uw.user_id AND o.workspace_id IS NULL;

WITH user_workspaces AS (
  SELECT wm.user_id, wm.workspace_id
  FROM public.workspace_members wm
  WHERE wm.role = 'owner'
)
UPDATE public.brand_charter bc
SET workspace_id = uw.workspace_id
FROM user_workspaces uw
WHERE bc.user_id = uw.user_id AND bc.workspace_id IS NULL;