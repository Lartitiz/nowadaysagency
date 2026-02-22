
-- Table to store validated column mappings for reuse
CREATE TABLE IF NOT EXISTS public.import_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  file_name TEXT,
  sheet_name TEXT,
  column_mapping JSONB NOT NULL DEFAULT '{}',
  date_column INT DEFAULT 0,
  date_format TEXT DEFAULT 'auto',
  start_row INT DEFAULT 2,
  headers JSONB, -- store original headers for matching
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.import_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own mappings" ON public.import_mappings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own mappings" ON public.import_mappings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own mappings" ON public.import_mappings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own mappings" ON public.import_mappings FOR DELETE USING (auth.uid() = user_id);
