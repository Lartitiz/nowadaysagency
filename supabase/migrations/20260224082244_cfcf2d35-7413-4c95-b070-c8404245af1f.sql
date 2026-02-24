-- Auto-sync subscriptions.plan when a coaching program is activated/deactivated
CREATE OR REPLACE FUNCTION public.sync_plan_on_program_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Program activated → set plan to now_pilot
  IF NEW.status = 'active' THEN
    -- Upsert into subscriptions
    INSERT INTO public.subscriptions (user_id, plan, status, source)
    VALUES (NEW.client_user_id, 'now_pilot', 'active', 'coaching')
    ON CONFLICT (user_id) DO UPDATE SET
      plan = 'now_pilot',
      status = 'active',
      updated_at = now();
  END IF;

  -- Program completed/cancelled/paused → revert to free (only if no other active program)
  IF NEW.status IN ('completed', 'cancelled', 'paused') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.coaching_programs
      WHERE client_user_id = NEW.client_user_id
      AND status = 'active'
      AND id != NEW.id
    ) THEN
      UPDATE public.subscriptions
      SET plan = 'free', updated_at = now()
      WHERE user_id = NEW.client_user_id
      AND source = 'coaching';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_sync_plan_on_program_change
  AFTER INSERT OR UPDATE OF status ON public.coaching_programs
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_plan_on_program_change();

-- Backfill: sync any existing active programs that are missing from subscriptions
INSERT INTO public.subscriptions (user_id, plan, status, source)
SELECT cp.client_user_id, 'now_pilot', 'active', 'coaching'
FROM public.coaching_programs cp
WHERE cp.status = 'active'
AND NOT EXISTS (
  SELECT 1 FROM public.subscriptions s
  WHERE s.user_id = cp.client_user_id AND s.plan = 'now_pilot'
)
ON CONFLICT (user_id) DO UPDATE SET
  plan = 'now_pilot',
  status = 'active',
  updated_at = now();