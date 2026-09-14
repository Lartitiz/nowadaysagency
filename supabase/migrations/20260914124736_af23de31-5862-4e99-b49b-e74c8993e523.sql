-- Account-scoped preferences: preserve all existing rows, workspace references,
-- billing grants and owner-only profile writes. No global notification switches.
CREATE OR REPLACE FUNCTION public.save_active_channels(p_owner_id uuid, p_channels text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE affected integer;
BEGIN
  IF auth.uid() IS NULL OR p_owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'channels_owner_required'; END IF;
  IF p_channels IS NULL OR cardinality(p_channels) < 1 OR EXISTS (
    SELECT 1 FROM unnest(p_channels) c WHERE c IS NULL OR c NOT IN ('instagram','linkedin','newsletter','pinterest','site','seo')
  ) THEN RAISE EXCEPTION 'channels_invalid'; END IF;
  UPDATE public.profiles SET canaux=p_channels WHERE user_id=p_owner_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'channels_profile_missing'; END IF;
  INSERT INTO public.user_plan_config(user_id,channels) VALUES(p_owner_id,to_jsonb(p_channels))
  ON CONFLICT(user_id) DO UPDATE SET channels=excluded.channels;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'channels_plan_missing'; END IF;
  RETURN jsonb_build_object('saved',true);
END $$;
REVOKE ALL ON FUNCTION public.save_active_channels(uuid,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_active_channels(uuid,text[]) TO authenticated;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_tips boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notification_reminders boolean NOT NULL DEFAULT true;
GRANT UPDATE(notification_tips,notification_reminders) ON public.profiles TO authenticated;