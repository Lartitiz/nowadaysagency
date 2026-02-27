
-- Add autofill_status column to branding_autofill  
ALTER TABLE public.branding_autofill 
ADD COLUMN IF NOT EXISTS autofill_status text NOT NULL DEFAULT 'none'
CHECK (autofill_status IN ('none', 'pending_review', 'completed'));

-- Update existing rows that have autofill_pending_review = true
UPDATE public.branding_autofill SET autofill_status = 'pending_review' WHERE autofill_pending_review = true;
UPDATE public.branding_autofill SET autofill_status = 'completed' WHERE autofill_pending_review = false AND analysis_result IS NOT NULL;
