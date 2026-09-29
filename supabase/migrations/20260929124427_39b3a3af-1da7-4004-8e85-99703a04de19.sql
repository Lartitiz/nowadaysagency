-- The technical prompt now includes explicit continuity constraints and the
-- ordered reference mapping. The original 1000-character check was an app
-- limit, not a documented Seedance 2.5 API limit.
ALTER TABLE public.studio_video_jobs
  DROP CONSTRAINT IF EXISTS studio_video_jobs_prompt_check;
ALTER TABLE public.studio_video_jobs
  ADD CONSTRAINT studio_video_jobs_prompt_check CHECK (length(prompt) BETWEEN 3 AND 3000);
ALTER TABLE public.studio_video_jobs
  ADD COLUMN IF NOT EXISTS preparation jsonb;