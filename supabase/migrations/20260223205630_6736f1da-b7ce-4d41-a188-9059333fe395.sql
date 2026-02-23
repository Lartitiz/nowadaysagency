ALTER TABLE public.coaching_programs 
ADD COLUMN IF NOT EXISTS dashboard_message TEXT 
  DEFAULT 'Bienvenue dans Now Pilot ! J''ai hâte de bosser ensemble 🌸';