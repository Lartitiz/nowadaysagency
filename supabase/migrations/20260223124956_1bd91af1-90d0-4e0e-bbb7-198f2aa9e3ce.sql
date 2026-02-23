
-- Coaching programs table
CREATE TABLE IF NOT EXISTS public.coaching_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id UUID NOT NULL,
  coach_user_id UUID NOT NULL,
  start_date DATE,
  end_date DATE,
  current_phase TEXT NOT NULL DEFAULT 'strategy',
  current_month INT NOT NULL DEFAULT 1,
  whatsapp_link TEXT,
  calendly_link TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_user_id)
);

-- Coaching sessions table
CREATE TABLE IF NOT EXISTS public.coaching_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.coaching_programs(id) ON DELETE CASCADE,
  session_number INT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'strategy',
  title TEXT,
  focus TEXT,
  scheduled_date TIMESTAMPTZ,
  duration_minutes INT NOT NULL DEFAULT 90,
  meeting_link TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  prep_notes TEXT,
  summary TEXT,
  modules_updated TEXT[],
  laetitia_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Coaching actions table
CREATE TABLE IF NOT EXISTS public.coaching_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.coaching_programs(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.coaching_sessions(id),
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Coaching deliverables table
CREATE TABLE IF NOT EXISTS public.coaching_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.coaching_programs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  delivered_at TIMESTAMPTZ,
  route TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.coaching_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_deliverables ENABLE ROW LEVEL SECURITY;

-- Programs: client sees own
CREATE POLICY "client_own_program" ON public.coaching_programs
  FOR SELECT USING (auth.uid() = client_user_id);

-- Programs: coach full access
CREATE POLICY "coach_all_programs" ON public.coaching_programs
  FOR ALL USING ((auth.jwt() ->> 'email') = 'laetitia@nowadaysagency.com');

-- Sessions: client sees own via program
CREATE POLICY "client_own_sessions" ON public.coaching_sessions
  FOR SELECT USING (
    program_id IN (SELECT id FROM public.coaching_programs WHERE client_user_id = auth.uid())
  );

-- Sessions: coach full access
CREATE POLICY "coach_all_sessions" ON public.coaching_sessions
  FOR ALL USING ((auth.jwt() ->> 'email') = 'laetitia@nowadaysagency.com');

-- Actions: client full access (can check off actions)
CREATE POLICY "client_own_actions" ON public.coaching_actions
  FOR ALL USING (
    program_id IN (SELECT id FROM public.coaching_programs WHERE client_user_id = auth.uid())
  );

-- Actions: coach full access
CREATE POLICY "coach_all_actions" ON public.coaching_actions
  FOR ALL USING ((auth.jwt() ->> 'email') = 'laetitia@nowadaysagency.com');

-- Deliverables: client sees own
CREATE POLICY "client_own_deliverables" ON public.coaching_deliverables
  FOR SELECT USING (
    program_id IN (SELECT id FROM public.coaching_programs WHERE client_user_id = auth.uid())
  );

-- Deliverables: coach full access
CREATE POLICY "coach_all_deliverables" ON public.coaching_deliverables
  FOR ALL USING ((auth.jwt() ->> 'email') = 'laetitia@nowadaysagency.com');
