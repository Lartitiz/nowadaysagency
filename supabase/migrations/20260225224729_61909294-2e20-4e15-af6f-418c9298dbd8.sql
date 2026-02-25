
CREATE TABLE public.sales_page_optimizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  site_url TEXT NOT NULL,
  focus TEXT,
  raw_result JSONB,
  score_global INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_page_optimizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own optimizations"
  ON public.sales_page_optimizations FOR SELECT
  USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));

CREATE POLICY "Users can insert own optimizations"
  ON public.sales_page_optimizations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own optimizations"
  ON public.sales_page_optimizations FOR DELETE
  USING (auth.uid() = user_id);
