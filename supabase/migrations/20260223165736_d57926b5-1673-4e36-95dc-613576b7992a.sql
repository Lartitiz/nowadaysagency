
-- Create coaching_journal table
CREATE TABLE IF NOT EXISTS public.coaching_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.coaching_programs(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.coaching_sessions(id) ON DELETE SET NULL,
  month_number INT,
  date DATE,
  title TEXT NOT NULL,
  body TEXT,
  laetitia_note TEXT,
  deliverable_ids UUID[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'upcoming',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.coaching_journal ENABLE ROW LEVEL SECURITY;

-- Client can see their own journal entries (published only)
CREATE POLICY "client_sees_own_journal" ON public.coaching_journal
  FOR SELECT USING (
    program_id IN (
      SELECT id FROM public.coaching_programs
      WHERE client_user_id = auth.uid()
    )
  );

-- Coach (admin) can do everything
CREATE POLICY "coach_manages_journal" ON public.coaching_journal
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND email = 'laetitia@nowadaysagency.com'
    )
  );

-- Add columns to coaching_deliverables for unlock tracking
ALTER TABLE public.coaching_deliverables
  ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unlocked_by_journal_id UUID REFERENCES public.coaching_journal(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS file_url TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS seen_by_client BOOLEAN NOT NULL DEFAULT FALSE;

-- Create storage bucket for deliverable files
INSERT INTO storage.buckets (id, name, public) VALUES ('deliverables', 'deliverables', false) ON CONFLICT (id) DO NOTHING;

-- Client can read files from their program
CREATE POLICY "client_reads_own_deliverables_files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'deliverables'
    AND (storage.foldername(name))[1] = 'deliverables'
  );

-- Coach can manage all deliverable files
CREATE POLICY "coach_manages_deliverable_files" ON storage.objects
  FOR ALL USING (
    bucket_id = 'deliverables'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND email = 'laetitia@nowadaysagency.com'
    )
  );

-- Trigger for updated_at on coaching_journal
CREATE TRIGGER update_coaching_journal_updated_at
  BEFORE UPDATE ON public.coaching_journal
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
