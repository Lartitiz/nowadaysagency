
-- 1. Add branding columns to brand_profile
ALTER TABLE public.brand_profile
  ADD COLUMN IF NOT EXISTS positioning TEXT,
  ADD COLUMN IF NOT EXISTS values JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tone_keywords JSONB DEFAULT '[]'::jsonb;

-- 2. Add description column to persona
ALTER TABLE public.persona
  ADD COLUMN IF NOT EXISTS description TEXT;

-- 3. Add onboarding_step to profiles for resuming
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_step INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- 4. Create user_offers table
CREATE TABLE IF NOT EXISTS public.user_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  price TEXT,
  description TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own offers" ON public.user_offers
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own offers" ON public.user_offers
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own offers" ON public.user_offers
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own offers" ON public.user_offers
  FOR DELETE USING (auth.uid() = user_id);

-- 5. Create user_documents table
CREATE TABLE IF NOT EXISTS public.user_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  file_name TEXT,
  file_url TEXT,
  file_type TEXT,
  context TEXT DEFAULT 'onboarding',
  processed BOOLEAN DEFAULT FALSE,
  extracted_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents" ON public.user_documents
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own documents" ON public.user_documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own documents" ON public.user_documents
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own documents" ON public.user_documents
  FOR DELETE USING (auth.uid() = user_id);

-- 6. Create storage bucket for onboarding uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('onboarding-uploads', 'onboarding-uploads', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload own onboarding files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'onboarding-uploads' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own onboarding files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'onboarding-uploads' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 7. Trigger for user_offers updated_at
CREATE TRIGGER update_user_offers_updated_at
  BEFORE UPDATE ON public.user_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
