
-- Add page type and new section fields to website_homepage
ALTER TABLE public.website_homepage ADD COLUMN IF NOT EXISTS page_type text DEFAULT 'home';
ALTER TABLE public.website_homepage ADD COLUMN IF NOT EXISTS offer_name text;
ALTER TABLE public.website_homepage ADD COLUMN IF NOT EXISTS offer_price text;
ALTER TABLE public.website_homepage ADD COLUMN IF NOT EXISTS offer_included text;
ALTER TABLE public.website_homepage ADD COLUMN IF NOT EXISTS offer_payment text;
ALTER TABLE public.website_homepage ADD COLUMN IF NOT EXISTS offer_comparison text;
ALTER TABLE public.website_homepage ADD COLUMN IF NOT EXISTS for_who_ideal text;
ALTER TABLE public.website_homepage ADD COLUMN IF NOT EXISTS for_who_not text;
ALTER TABLE public.website_homepage ADD COLUMN IF NOT EXISTS seo_title text;
ALTER TABLE public.website_homepage ADD COLUMN IF NOT EXISTS seo_meta text;
ALTER TABLE public.website_homepage ADD COLUMN IF NOT EXISTS seo_h1 text;
ALTER TABLE public.website_homepage ADD COLUMN IF NOT EXISTS checklist_data jsonb;
ALTER TABLE public.website_homepage ADD COLUMN IF NOT EXISTS cta_micro_copy text;
