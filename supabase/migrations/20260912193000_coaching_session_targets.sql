-- Retain old sessions as unassigned history. Never infer a persona/offer from content.
ALTER TABLE public.branding_coaching_sessions
  ADD COLUMN IF NOT EXISTS persona_id uuid,
  ADD COLUMN IF NOT EXISTS offer_id uuid,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.branding_coaching_sessions
  DROP CONSTRAINT IF EXISTS branding_coaching_sessions_user_id_section_key;

-- A space owns a session; user_id is only the legacy scope when no space exists.
CREATE UNIQUE INDEX IF NOT EXISTS branding_coaching_session_target_key
  ON public.branding_coaching_sessions
    (COALESCE(workspace_id, user_id), section, persona_id, offer_id) NULLS NOT DISTINCT
  WHERE archived_at IS NULL;

COMMENT ON COLUMN public.branding_coaching_sessions.persona_id IS
  'Explicit public selected for new sessions. NULL legacy sessions remain unassigned.';
COMMENT ON COLUMN public.branding_coaching_sessions.offer_id IS
  'Explicit offer selected for new sessions. NULL legacy sessions remain unassigned.';
