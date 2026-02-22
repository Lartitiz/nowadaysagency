
-- Studio coachings table
CREATE TABLE IF NOT EXISTS public.studio_coachings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  scheduled_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  calendly_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.studio_coachings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own coachings"
  ON public.studio_coachings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own coachings"
  ON public.studio_coachings FOR UPDATE
  USING (auth.uid() = user_id);

-- Studio deliverables table
CREATE TABLE IF NOT EXISTS public.studio_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  deliverable_type TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'not_started',
  validated_at TIMESTAMPTZ,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.studio_deliverables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own deliverables"
  ON public.studio_deliverables FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own deliverables"
  ON public.studio_deliverables FOR UPDATE
  USING (auth.uid() = user_id);

-- Studio binômes table
CREATE TABLE IF NOT EXISTS public.studio_binomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL,
  user_b UUID NOT NULL,
  cohort TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.studio_binomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own binomes"
  ON public.studio_binomes FOR SELECT
  USING (auth.uid() = user_a OR auth.uid() = user_b);
