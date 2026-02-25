
CREATE TABLE public.shared_branding_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  title TEXT DEFAULT 'Ma synthèse branding',
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '30 days'),
  is_active BOOLEAN DEFAULT true,
  views_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_shared_branding_token ON public.shared_branding_links(token);

ALTER TABLE public.shared_branding_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own links" ON public.shared_branding_links FOR ALL USING (auth.uid() = user_id);
