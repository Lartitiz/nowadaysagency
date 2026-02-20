
-- Create brand_strategy table
CREATE TABLE public.brand_strategy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  step_1_hidden_facets TEXT,
  facet_1 TEXT,
  facet_1_format TEXT,
  facet_2 TEXT,
  facet_2_format TEXT,
  facet_3 TEXT,
  facet_3_format TEXT,
  cloud_offer TEXT,
  cloud_clients TEXT,
  cloud_universe TEXT,
  pillar_major TEXT,
  pillar_minor_1 TEXT,
  pillar_minor_2 TEXT,
  pillar_minor_3 TEXT,
  creative_concept TEXT,
  ai_facets JSONB,
  ai_words JSONB,
  ai_pillars JSONB,
  ai_concepts JSONB,
  current_step INTEGER DEFAULT 1,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.brand_strategy ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own strategy" ON public.brand_strategy FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own strategy" ON public.brand_strategy FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own strategy" ON public.brand_strategy FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own strategy" ON public.brand_strategy FOR DELETE USING (auth.uid() = user_id);
