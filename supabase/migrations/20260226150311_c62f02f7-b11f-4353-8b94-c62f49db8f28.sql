
-- Trigger function: award 5 bonus credits + notification to inviter on invitation acceptance
CREATE OR REPLACE FUNCTION public.reward_referral_on_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only fire when accepted_at transitions from NULL to a value
  IF OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL AND NEW.invited_by IS NOT NULL THEN
    -- Award 5 bonus credits
    PERFORM public.increment_bonus_credits(NEW.invited_by, 5);

    -- Insert notification for the inviter
    INSERT INTO public.notifications (user_id, type, title, message, read)
    VALUES (
      NEW.invited_by,
      'referral_bonus',
      '🎁 +5 crédits bonus !',
      'Quelqu''un a rejoint ton workspace. Merci pour le partage !',
      false
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- Attach trigger to workspace_invitations
CREATE TRIGGER trg_reward_referral_on_accept
AFTER UPDATE ON public.workspace_invitations
FOR EACH ROW
EXECUTE FUNCTION public.reward_referral_on_accept();
