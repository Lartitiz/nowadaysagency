
-- Fix users who completed onboarding but flag wasn't saved
UPDATE public.profiles
SET onboarding_completed = true,
    onboarding_completed_at = COALESCE(onboarding_completed_at, now())
WHERE onboarding_completed = false
  AND prenom IS NOT NULL AND prenom != ''
  AND activite IS NOT NULL AND activite != '';

-- Ensure user_plan_config row exists for completed profiles
INSERT INTO public.user_plan_config (user_id, onboarding_completed, onboarding_completed_at)
SELECT p.user_id, true, now()
FROM public.profiles p
LEFT JOIN public.user_plan_config upc ON upc.user_id = p.user_id
WHERE p.onboarding_completed = true
  AND upc.id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Sync plan_config flag with profiles
UPDATE public.user_plan_config upc
SET onboarding_completed = true,
    onboarding_completed_at = COALESCE(upc.onboarding_completed_at, now())
FROM public.profiles p
WHERE upc.user_id = p.user_id
  AND p.onboarding_completed = true
  AND upc.onboarding_completed = false;
