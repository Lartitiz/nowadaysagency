
-- Pinterest profile
CREATE TABLE public.pinterest_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  pro_account_done BOOLEAN DEFAULT FALSE,
  photo_done BOOLEAN DEFAULT FALSE,
  display_name TEXT,
  name_done BOOLEAN DEFAULT FALSE,
  bio TEXT,
  bio_done BOOLEAN DEFAULT FALSE,
  website_url TEXT,
  url_done BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.pinterest_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own pinterest profile" ON public.pinterest_profile FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own pinterest profile" ON public.pinterest_profile FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own pinterest profile" ON public.pinterest_profile FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own pinterest profile" ON public.pinterest_profile FOR DELETE USING (auth.uid() = user_id);

-- Pinterest boards
CREATE TABLE public.pinterest_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  board_type TEXT DEFAULT 'autre',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.pinterest_boards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own boards" ON public.pinterest_boards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own boards" ON public.pinterest_boards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own boards" ON public.pinterest_boards FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own boards" ON public.pinterest_boards FOR DELETE USING (auth.uid() = user_id);

-- Pinterest keywords
CREATE TABLE public.pinterest_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  keywords_raw TEXT,
  keywords_product TEXT[] DEFAULT '{}',
  keywords_need TEXT[] DEFAULT '{}',
  keywords_inspiration TEXT[] DEFAULT '{}',
  keywords_english TEXT[] DEFAULT '{}',
  checklist_titles BOOLEAN DEFAULT FALSE,
  checklist_board_desc BOOLEAN DEFAULT FALSE,
  checklist_pin_titles BOOLEAN DEFAULT FALSE,
  checklist_pin_desc BOOLEAN DEFAULT FALSE,
  checklist_profile_name BOOLEAN DEFAULT FALSE,
  checklist_bio BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.pinterest_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own keywords" ON public.pinterest_keywords FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own keywords" ON public.pinterest_keywords FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own keywords" ON public.pinterest_keywords FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own keywords" ON public.pinterest_keywords FOR DELETE USING (auth.uid() = user_id);

-- Pinterest pins
CREATE TABLE public.pinterest_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  subject TEXT,
  board_id UUID REFERENCES public.pinterest_boards(id) ON DELETE SET NULL,
  link_url TEXT,
  title TEXT,
  description TEXT,
  variant_type TEXT DEFAULT 'seo',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.pinterest_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own pins" ON public.pinterest_pins FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own pins" ON public.pinterest_pins FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own pins" ON public.pinterest_pins FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own pins" ON public.pinterest_pins FOR DELETE USING (auth.uid() = user_id);

-- Pinterest routine
CREATE TABLE public.pinterest_routine (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  rhythm TEXT DEFAULT '2h_monthly',
  current_month DATE,
  pins_target INTEGER DEFAULT 5,
  pins_done INTEGER DEFAULT 0,
  recycled_done BOOLEAN DEFAULT FALSE,
  links_checked BOOLEAN DEFAULT FALSE,
  stats_checked BOOLEAN DEFAULT FALSE,
  top_pins_noted BOOLEAN DEFAULT FALSE,
  keywords_adjusted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.pinterest_routine ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own routine" ON public.pinterest_routine FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own routine" ON public.pinterest_routine FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own routine" ON public.pinterest_routine FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own routine" ON public.pinterest_routine FOR DELETE USING (auth.uid() = user_id);
