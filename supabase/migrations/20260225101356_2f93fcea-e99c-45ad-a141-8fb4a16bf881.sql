
-- Table brand_charter
CREATE TABLE public.brand_charter (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logo_url TEXT,
  logo_variants JSONB DEFAULT '[]'::jsonb,
  color_primary TEXT DEFAULT '#E91E8C',
  color_secondary TEXT DEFAULT '#1A1A2E',
  color_accent TEXT DEFAULT '#FFE561',
  color_background TEXT DEFAULT '#FFFFFF',
  color_text TEXT DEFAULT '#1A1A2E',
  custom_colors JSONB DEFAULT '[]'::jsonb,
  font_title TEXT DEFAULT 'Inter',
  font_body TEXT DEFAULT 'Inter',
  font_accent TEXT,
  photo_style TEXT,
  photo_keywords JSONB DEFAULT '[]'::jsonb,
  mood_keywords JSONB DEFAULT '[]'::jsonb,
  visual_donts TEXT,
  mood_board_urls JSONB DEFAULT '[]'::jsonb,
  icon_style TEXT DEFAULT 'outline',
  border_radius TEXT DEFAULT 'rounded',
  uploaded_templates JSONB DEFAULT '[]'::jsonb,
  completion_pct INTEGER DEFAULT 0,
  ai_generated_brief TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE UNIQUE INDEX idx_brand_charter_user ON public.brand_charter(user_id);

ALTER TABLE public.brand_charter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own charter" ON public.brand_charter FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own charter" ON public.brand_charter FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own charter" ON public.brand_charter FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own charter" ON public.brand_charter FOR DELETE USING (auth.uid() = user_id);

-- Bucket brand-assets
INSERT INTO storage.buckets (id, name, public) VALUES ('brand-assets', 'brand-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload brand assets" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'brand-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Anyone can view brand assets" ON storage.objects FOR SELECT USING (bucket_id = 'brand-assets');
CREATE POLICY "Users can delete own brand assets" ON storage.objects FOR DELETE USING (bucket_id = 'brand-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
