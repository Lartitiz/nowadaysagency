
-- Create brand_profile table
CREATE TABLE public.brand_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  mission TEXT DEFAULT '',
  offer TEXT DEFAULT '',
  target_description TEXT DEFAULT '',
  target_problem TEXT DEFAULT '',
  target_beliefs TEXT DEFAULT '',
  target_verbatims TEXT DEFAULT '',
  tone_register TEXT DEFAULT '',
  tone_level TEXT DEFAULT '',
  tone_style TEXT DEFAULT '',
  tone_humor TEXT DEFAULT '',
  tone_engagement TEXT DEFAULT '',
  key_expressions TEXT DEFAULT '',
  things_to_avoid TEXT DEFAULT '',
  channels TEXT[] DEFAULT '{instagram}'::text[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.brand_profile ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own brand profile"
  ON public.brand_profile FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own brand profile"
  ON public.brand_profile FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own brand profile"
  ON public.brand_profile FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at
CREATE TRIGGER update_brand_profile_updated_at
  BEFORE UPDATE ON public.brand_profile
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
