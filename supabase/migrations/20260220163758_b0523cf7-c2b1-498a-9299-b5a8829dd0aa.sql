
-- Table: highlight categories selected by user
CREATE TABLE public.highlight_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  category TEXT NOT NULL,
  notes TEXT DEFAULT '',
  has_existing_stories BOOLEAN DEFAULT false,
  needs_content_creation BOOLEAN DEFAULT false,
  noted_in_calendar BOOLEAN DEFAULT false,
  stories_grouped BOOLEAN DEFAULT false,
  covers_created BOOLEAN DEFAULT false,
  added_to_profile BOOLEAN DEFAULT false,
  canva_link TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.highlight_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own highlights" ON public.highlight_categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own highlights" ON public.highlight_categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own highlights" ON public.highlight_categories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own highlights" ON public.highlight_categories FOR DELETE USING (auth.uid() = user_id);

-- Table: inspiration accounts
CREATE TABLE public.inspiration_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  account_handle TEXT NOT NULL DEFAULT '',
  frequent_formats TEXT DEFAULT '',
  top_engagement TEXT DEFAULT '',
  tone TEXT[] DEFAULT '{}',
  appeal TEXT DEFAULT '',
  slot_index INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.inspiration_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own inspiration" ON public.inspiration_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own inspiration" ON public.inspiration_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own inspiration" ON public.inspiration_accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own inspiration" ON public.inspiration_accounts FOR DELETE USING (auth.uid() = user_id);

-- Table: inspiration notes (what the user wants to try)
CREATE TABLE public.inspiration_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.inspiration_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own notes" ON public.inspiration_notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notes" ON public.inspiration_notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notes" ON public.inspiration_notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notes" ON public.inspiration_notes FOR DELETE USING (auth.uid() = user_id);

-- Table: launches
CREATE TABLE public.launches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  teasing_start DATE,
  teasing_end DATE,
  sale_start DATE,
  sale_end DATE,
  promise TEXT DEFAULT '',
  objections TEXT DEFAULT '',
  free_resource TEXT DEFAULT '',
  selected_contents TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.launches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own launches" ON public.launches FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own launches" ON public.launches FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own launches" ON public.launches FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own launches" ON public.launches FOR DELETE USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_highlight_categories_updated_at BEFORE UPDATE ON public.highlight_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_inspiration_accounts_updated_at BEFORE UPDATE ON public.inspiration_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_inspiration_notes_updated_at BEFORE UPDATE ON public.inspiration_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_launches_updated_at BEFORE UPDATE ON public.launches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
