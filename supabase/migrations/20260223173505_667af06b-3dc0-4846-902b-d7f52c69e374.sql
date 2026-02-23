
-- Remove FK constraint referencing coaching_journal
ALTER TABLE public.coaching_deliverables
DROP CONSTRAINT IF EXISTS coaching_deliverables_unlocked_by_journal_id_fkey;

-- Remove the journal-related column from deliverables
ALTER TABLE public.coaching_deliverables
DROP COLUMN IF EXISTS unlocked_by_journal_id;

-- Add private_notes to coaching_sessions
ALTER TABLE public.coaching_sessions
ADD COLUMN IF NOT EXISTS private_notes TEXT;

-- Add assigned_session_id to coaching_deliverables
ALTER TABLE public.coaching_deliverables
ADD COLUMN IF NOT EXISTS assigned_session_id UUID REFERENCES public.coaching_sessions(id) ON DELETE SET NULL;

-- Now drop coaching_journal
DROP TABLE IF EXISTS public.coaching_journal;
