-- Drop old email_sends table (created in previous migration, likely empty)
DROP POLICY IF EXISTS "Only admins can view email_sends" ON public.email_sends;
DROP POLICY IF EXISTS "Service role can insert email_sends" ON public.email_sends;
DROP TABLE IF EXISTS public.email_sends;

-- 1. email_templates
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  category TEXT DEFAULT 'transactional',
  variables TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read email_templates"
ON public.email_templates FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 2. email_sequences
CREATE TABLE public.email_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.email_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read email_sequences"
ON public.email_sequences FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 3. email_sequence_steps
CREATE TABLE public.email_sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES public.email_sequences(id) ON DELETE CASCADE NOT NULL,
  step_number INTEGER NOT NULL,
  delay_hours INTEGER NOT NULL DEFAULT 0,
  template_id UUID REFERENCES public.email_templates(id) NOT NULL,
  condition_sql TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sequence_id, step_number)
);

ALTER TABLE public.email_sequence_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read email_sequence_steps"
ON public.email_sequence_steps FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 4. email_sends (rebuilt with proper references)
CREATE TABLE public.email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  sequence_id UUID REFERENCES public.email_sequences(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT DEFAULT 'sent',
  resend_id TEXT,
  error TEXT,
  sent_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.email_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read email_sends"
ON public.email_sends FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 5. email_queue
CREATE TABLE public.email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sequence_id UUID REFERENCES public.email_sequences(id) ON DELETE CASCADE NOT NULL,
  step_id UUID REFERENCES public.email_sequence_steps(id) ON DELETE CASCADE NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent BOOLEAN DEFAULT false,
  cancelled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read email_queue"
ON public.email_queue FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));