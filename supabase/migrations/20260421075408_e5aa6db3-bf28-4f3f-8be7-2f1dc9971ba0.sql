-- 1. Création de la table public.series
CREATE TABLE IF NOT EXISTS public.series (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    promise TEXT NOT NULL,
    pillar_key TEXT,
    cadence TEXT CHECK (cadence IN ('weekly', 'biweekly', 'monthly', 'irregular')) DEFAULT NULL,
    format_template TEXT,
    signature_description TEXT,
    channels TEXT[] DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
    planned_episodes INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. RLS
ALTER TABLE public.series ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_select_series ON public.series
    FOR SELECT USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY workspace_insert_series ON public.series
    FOR INSERT WITH CHECK (public.user_has_workspace_access(workspace_id));

CREATE POLICY workspace_update_series ON public.series
    FOR UPDATE USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY workspace_delete_series ON public.series
    FOR DELETE USING (public.user_has_workspace_access(workspace_id));

-- 3. Trigger updated_at
CREATE TRIGGER update_series_updated_at
    BEFORE UPDATE ON public.series
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Index
CREATE INDEX idx_series_workspace_active ON public.series(workspace_id) 
    WHERE status = 'active';

CREATE INDEX idx_series_user ON public.series(user_id);

-- 5. Rattachement sur calendar_posts
ALTER TABLE public.calendar_posts
    ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES public.series(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS episode_number INTEGER CHECK (episode_number >= 1);

CREATE INDEX IF NOT EXISTS idx_calendar_posts_series
    ON public.calendar_posts(series_id)
    WHERE series_id IS NOT NULL;

-- 6. COMMENT ON COLUMN
COMMENT ON COLUMN public.series.pillar_key IS 
    'Clé du pilier brand_strategy associé. Valeurs attendues: pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3, ou NULL pour série transversale';

COMMENT ON COLUMN public.series.cadence IS 
    'Cadence éditoriale de la série. Valeurs: weekly (hebdo), biweekly (2 semaines), monthly (mensuel), irregular (irrégulier)';

COMMENT ON COLUMN public.series.channels IS 
    'Array des canaux ciblés par la série. Valeurs possibles: instagram, linkedin, pinterest, newsletter, website';

COMMENT ON COLUMN public.series.status IS 
    'Statut de la série. Valeurs: active (en cours), paused (en pause), archived (archivée)';

COMMENT ON COLUMN public.series.planned_episodes IS 
    'Nombre d''épisodes prévus pour la série. NULL = série ouverte sans fin annoncée';