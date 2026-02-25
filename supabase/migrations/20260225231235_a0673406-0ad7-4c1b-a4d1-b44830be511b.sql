
-- Add multi-persona columns to persona table
ALTER TABLE public.persona
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS channels TEXT[];

-- Set all existing personas as primary (retrocompatible)
UPDATE public.persona SET is_primary = true WHERE is_primary = false;

-- Index for fast primary persona lookup
CREATE INDEX IF NOT EXISTS idx_persona_user_primary ON public.persona (user_id, is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_persona_workspace_primary ON public.persona (workspace_id, is_primary) WHERE is_primary = true;

-- GIN index for channel-based lookups
CREATE INDEX IF NOT EXISTS idx_persona_channels ON public.persona USING GIN (channels);
