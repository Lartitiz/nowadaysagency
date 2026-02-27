-- Add workspace_id column to brand_charter
ALTER TABLE public.brand_charter
ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id);

-- Backfill workspace_id from the user's owner workspace
UPDATE public.brand_charter bc
SET workspace_id = wm.workspace_id
FROM public.workspace_members wm
WHERE wm.user_id = bc.user_id AND wm.role = 'owner'
AND bc.workspace_id IS NULL;

-- Add index for workspace queries
CREATE INDEX idx_brand_charter_workspace_id ON public.brand_charter(workspace_id);
