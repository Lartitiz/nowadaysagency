-- Disposable fixture database only. Run with psql -v ON_ERROR_STOP=1.
BEGIN;
CREATE TABLE public.branding_coaching_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  workspace_id uuid, section text NOT NULL, messages jsonb DEFAULT '[]',
  UNIQUE (user_id, section)
);
INSERT INTO public.branding_coaching_sessions (id, user_id, workspace_id, section, messages) VALUES
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'persona', '["legacy history"]');
\ir ../migrations/20260912193000_coaching_session_targets.sql
DO $$
DECLARE w1 uuid := '20000000-0000-0000-0000-000000000001';
        w2 uuid := '20000000-0000-0000-0000-000000000002';
        u uuid := '10000000-0000-0000-0000-000000000001';
        p1 uuid := '30000000-0000-0000-0000-000000000001';
        p2 uuid := '30000000-0000-0000-0000-000000000002';
BEGIN
  IF NOT EXISTS (SELECT FROM public.branding_coaching_sessions WHERE id = '00000000-0000-0000-0000-000000000001' AND persona_id IS NULL AND offer_id IS NULL AND messages = '["legacy history"]'::jsonb) THEN
    RAISE EXCEPTION 'Legacy session modified';
  END IF;
  INSERT INTO public.branding_coaching_sessions (user_id, workspace_id, section, persona_id) VALUES (u,w1,'persona',p1),(u,w1,'persona',p2),(u,w2,'persona',p1);
  BEGIN
    INSERT INTO public.branding_coaching_sessions (user_id, workspace_id, section, persona_id) VALUES (u,w1,'persona',p1);
    RAISE EXCEPTION 'Duplicate active session allowed';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  UPDATE public.branding_coaching_sessions SET archived_at = now() WHERE workspace_id = w1 AND persona_id = p1;
  INSERT INTO public.branding_coaching_sessions (user_id, workspace_id, section, persona_id) VALUES (u,w1,'persona',p1);
  IF (SELECT count(*) FROM public.branding_coaching_sessions WHERE workspace_id = w1 AND persona_id = p1) <> 2 THEN RAISE EXCEPTION 'Archived history lost'; END IF;
  INSERT INTO public.branding_coaching_sessions (user_id, workspace_id, section, offer_id) VALUES (u,w1,'offers',p1),(u,w1,'offers',p2),(u,w2,'offers',p1);
  INSERT INTO public.branding_coaching_sessions (user_id, section, offer_id) VALUES (u,'offers',p1);
END $$;
ROLLBACK;
