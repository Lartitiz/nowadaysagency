
-- Create the offers table for the offer positioning workshop
CREATE TABLE public.offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  
  offer_type TEXT NOT NULL DEFAULT 'paid', -- 'paid', 'free', 'service'
  name TEXT NOT NULL DEFAULT '',
  description_short TEXT,
  price_text TEXT,
  price_amount DECIMAL,
  url_sales_page TEXT,
  url_booking TEXT,
  
  problem_surface TEXT,
  problem_deep TEXT,
  
  promise TEXT,
  promise_long TEXT,
  sales_line TEXT,
  
  features JSONB DEFAULT '[]'::jsonb,
  benefits JSONB DEFAULT '[]'::jsonb,
  features_to_benefits JSONB DEFAULT '[]'::jsonb,
  
  target_ideal TEXT,
  target_not_for TEXT,
  trigger_situation TEXT,
  
  objections JSONB DEFAULT '[]'::jsonb,
  testimonials JSONB DEFAULT '[]'::jsonb,
  
  emotional_before TEXT,
  emotional_after TEXT,
  feelings_after JSONB DEFAULT '[]'::jsonb,
  
  linked_freebie_id UUID,
  
  current_step INTEGER DEFAULT 1,
  completed BOOLEAN DEFAULT false,
  completion_pct INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own offers" ON public.offers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own offers" ON public.offers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own offers" ON public.offers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own offers" ON public.offers FOR DELETE USING (auth.uid() = user_id);

-- Foreign key for linked_freebie_id (self-referencing)
ALTER TABLE public.offers ADD CONSTRAINT offers_linked_freebie_fkey FOREIGN KEY (linked_freebie_id) REFERENCES public.offers(id) ON DELETE SET NULL;

-- Trigger for updated_at
CREATE TRIGGER update_offers_updated_at BEFORE UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
