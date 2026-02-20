
-- Table: website_profile (CMS choice)
CREATE TABLE public.website_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  cms TEXT DEFAULT 'none',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.website_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own website profile" ON public.website_profile FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own website profile" ON public.website_profile FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own website profile" ON public.website_profile FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own website profile" ON public.website_profile FOR DELETE USING (auth.uid() = user_id);

-- Table: website_homepage (6-step homepage builder)
CREATE TABLE public.website_homepage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  hook_title TEXT,
  hook_subtitle TEXT,
  hook_image_done BOOLEAN DEFAULT FALSE,
  problem_block TEXT,
  benefits_block TEXT,
  offer_block TEXT,
  presentation_block TEXT,
  social_proof_done BOOLEAN DEFAULT FALSE,
  faq JSONB DEFAULT '[]'::jsonb,
  cta_primary TEXT,
  cta_secondary TEXT,
  cta_objective TEXT,
  layout_notes TEXT,
  layout_done BOOLEAN DEFAULT FALSE,
  current_step INTEGER DEFAULT 1,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.website_homepage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own homepage" ON public.website_homepage FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own homepage" ON public.website_homepage FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own homepage" ON public.website_homepage FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own homepage" ON public.website_homepage FOR DELETE USING (auth.uid() = user_id);
