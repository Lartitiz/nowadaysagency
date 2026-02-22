
-- Stats configuration per user
CREATE TABLE IF NOT EXISTS public.stats_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Site web
  website_platform TEXT,
  website_platform_other TEXT,
  uses_ga4 BOOLEAN DEFAULT FALSE,
  traffic_sources JSONB DEFAULT '["search", "social", "pinterest", "instagram"]',
  
  -- Pages de vente
  sales_pages JSONB DEFAULT '[]',
  
  -- Business model
  business_type TEXT,
  business_metrics JSONB DEFAULT '["discovery_calls", "clients_signed", "revenue", "ad_budget"]',
  
  -- Custom metrics
  custom_metrics JSONB DEFAULT '[]',
  
  -- Launch metrics
  launch_metrics JSONB DEFAULT '["signups", "launch_dms", "link_clicks", "story_views", "conversions"]',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id)
);

ALTER TABLE public.stats_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own stats config" ON public.stats_config FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own stats config" ON public.stats_config FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own stats config" ON public.stats_config FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Add JSONB columns to monthly_stats for dynamic data
ALTER TABLE public.monthly_stats ADD COLUMN IF NOT EXISTS website_data JSONB DEFAULT '{}';
ALTER TABLE public.monthly_stats ADD COLUMN IF NOT EXISTS sales_pages_data JSONB DEFAULT '{}';
ALTER TABLE public.monthly_stats ADD COLUMN IF NOT EXISTS business_data JSONB DEFAULT '{}';
ALTER TABLE public.monthly_stats ADD COLUMN IF NOT EXISTS launch_data JSONB DEFAULT '{}';
ALTER TABLE public.monthly_stats ADD COLUMN IF NOT EXISTS custom_data JSONB DEFAULT '{}';
ALTER TABLE public.monthly_stats ADD COLUMN IF NOT EXISTS launch_name TEXT;
