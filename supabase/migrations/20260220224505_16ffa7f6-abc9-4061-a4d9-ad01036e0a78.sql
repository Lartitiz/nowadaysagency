
-- Add unique constraint on user_id for website tables to support upsert
ALTER TABLE public.website_profile ADD CONSTRAINT website_profile_user_id_key UNIQUE (user_id);
ALTER TABLE public.website_homepage ADD CONSTRAINT website_homepage_user_id_key UNIQUE (user_id);
