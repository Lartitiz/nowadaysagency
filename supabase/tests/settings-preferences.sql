\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA IF NOT EXISTS auth;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE NOT NULL,canaux text[] NOT NULL DEFAULT '{}',weekly_ritual_enabled boolean NOT NULL DEFAULT true,weekly_ritual_day smallint NOT NULL DEFAULT 1, bonus_credits integer DEFAULT 0);
CREATE TABLE public.user_plan_config(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE NOT NULL,workspace_id uuid,channels jsonb NOT NULL DEFAULT '["instagram"]',main_goal text DEFAULT 'original');
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_plan_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY own ON public.profiles FOR ALL TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
CREATE POLICY own ON public.user_plan_config FOR ALL TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
CREATE POLICY tenant_immovable ON public.user_plan_config AS RESTRICTIVE FOR ALL TO authenticated WITH CHECK(workspace_id IS NULL OR workspace_id='aaaaaaaa-0000-0000-0000-000000000001');
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT ON public.profiles,public.user_plan_config TO authenticated;
GRANT UPDATE(canaux,weekly_ritual_enabled,weekly_ritual_day) ON public.profiles TO authenticated;
GRANT INSERT,UPDATE ON public.user_plan_config TO authenticated;
INSERT INTO public.profiles(user_id,canaux,bonus_credits) VALUES('00000000-0000-0000-0000-000000000001',ARRAY['linkedin'],17),('00000000-0000-0000-0000-000000000002',ARRAY['site'],23);
INSERT INTO public.user_plan_config(user_id,workspace_id,channels) VALUES('00000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','["linkedin"]');
CREATE TEMP TABLE original AS SELECT to_jsonb(p) AS row FROM public.profiles p;
\ir ../migrations/20260914160000_settings_preferences.sql
DO $$ BEGIN
  IF EXISTS(SELECT row FROM original EXCEPT SELECT to_jsonb(p)-'notification_tips'-'notification_reminders' FROM profiles p) THEN RAISE EXCEPTION 'history changed'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
SELECT public.save_active_channels(auth.uid(),ARRAY['instagram','site']);
DO $$ BEGIN
 IF (SELECT canaux FROM profiles WHERE user_id=auth.uid())<>ARRAY['instagram','site'] THEN RAISE EXCEPTION 'profile not saved'; END IF;
 IF (SELECT channels FROM user_plan_config WHERE user_id=auth.uid())<>'["instagram","site"]' THEN RAISE EXCEPTION 'plan not saved'; END IF;
 IF (SELECT main_goal FROM user_plan_config WHERE user_id=auth.uid())<>'original' THEN RAISE EXCEPTION 'other fields changed'; END IF;
 BEGIN PERFORM public.save_active_channels('00000000-0000-0000-0000-000000000002',ARRAY['instagram']); RAISE EXCEPTION 'cross-account allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='cross-account allowed' THEN RAISE; END IF; END;
 BEGIN UPDATE profiles SET bonus_credits=100; RAISE EXCEPTION 'billing changed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE profiles SET notification_tips=false WHERE user_id=auth.uid();
END $$;
RESET ROLE;
-- Force a failure in table 2 after table 1 update: whole RPC must roll back.
CREATE FUNCTION public.fail_plan() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture_plan_failure'; END $$;
CREATE TRIGGER fail_plan BEFORE UPDATE ON public.user_plan_config FOR EACH ROW EXECUTE FUNCTION public.fail_plan();
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.save_active_channels(auth.uid(),ARRAY['pinterest']); RAISE EXCEPTION 'failure not triggered'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'fixture_plan_failure' THEN RAISE; END IF; END;
 IF (SELECT canaux FROM profiles WHERE user_id=auth.uid())<>ARRAY['instagram','site'] THEN RAISE EXCEPTION 'partial update persisted'; END IF;
END $$;
RESET ROLE;
DROP TRIGGER fail_plan ON public.user_plan_config;
SET LOCAL ROLE authenticated;
SELECT public.save_active_channels(auth.uid(),ARRAY['pinterest']);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
SELECT public.save_active_channels(auth.uid(),ARRAY['site']);
DO $$ BEGIN IF (SELECT workspace_id FROM user_plan_config WHERE user_id=auth.uid()) IS NOT NULL THEN RAISE EXCEPTION 'legacy assigned'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
DO $$ BEGIN
 BEGIN PERFORM public.save_active_channels(auth.uid(),ARRAY['site']); RAISE EXCEPTION 'zero row accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'channels_profile_missing' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM user_plan_config WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'partial insert'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
