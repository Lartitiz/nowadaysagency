ALTER TABLE public.visual_studio_sessions ADD COLUMN composition jsonb;
ALTER TABLE public.visual_studio_sessions ADD CONSTRAINT studio_composition_shape CHECK
 (composition IS NULL OR (jsonb_typeof(composition)='object' AND octet_length(composition::text)<420000));
