-- The original image-to-video jobs remain valid. New quotes may start from
-- text alone or from an ordered set of images in the same workspace.
ALTER TABLE public.studio_video_jobs DROP CONSTRAINT IF EXISTS studio_video_jobs_source_kind_check;
ALTER TABLE public.studio_video_jobs DROP CONSTRAINT IF EXISTS studio_video_jobs_person_free_attested_check;
ALTER TABLE public.studio_video_jobs ADD CONSTRAINT studio_video_jobs_source_kind_check
  CHECK (source_kind IN ('photo','studio_version','text','references'));
ALTER TABLE public.studio_video_jobs ALTER COLUMN source_id DROP NOT NULL;
ALTER TABLE public.studio_video_jobs ALTER COLUMN input_url DROP NOT NULL;
ALTER TABLE public.studio_video_jobs ADD COLUMN source_refs jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.studio_video_jobs ADD COLUMN input_urls jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.studio_video_jobs ADD COLUMN aspect_ratio text NOT NULL DEFAULT '9:16'
  CHECK (aspect_ratio IN ('9:16','16:9','1:1'));
ALTER TABLE public.studio_video_jobs ADD CONSTRAINT studio_video_source_shape CHECK (
  (source_kind IN ('photo','studio_version') AND source_id IS NOT NULL AND input_url IS NOT NULL)
  OR (source_kind = 'text' AND source_id IS NULL AND input_url IS NULL AND jsonb_array_length(input_urls) = 0)
  OR (source_kind = 'references' AND source_id IS NULL AND input_url IS NULL
    AND jsonb_array_length(input_urls) BETWEEN 2 AND 4 AND jsonb_array_length(source_refs) = jsonb_array_length(input_urls))
);
