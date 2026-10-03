ALTER TABLE public.higgsfield_image_spend DROP CONSTRAINT IF EXISTS higgsfield_image_spend_source_check;
ALTER TABLE public.higgsfield_image_spend ADD CONSTRAINT higgsfield_image_spend_source_check
 CHECK(source IN ('carousel-slide-image','product-on-model','visual-studio'));