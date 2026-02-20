-- Add new columns to storytelling table for multi-storytelling support
ALTER TABLE public.storytelling ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.storytelling ADD COLUMN IF NOT EXISTS story_type TEXT DEFAULT 'fondatrice';
ALTER TABLE public.storytelling ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'stepper';
ALTER TABLE public.storytelling ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT FALSE;
ALTER TABLE public.storytelling ADD COLUMN IF NOT EXISTS imported_text TEXT;

-- Create a function to ensure only one primary storytelling per user
CREATE OR REPLACE FUNCTION public.ensure_single_primary_storytelling()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = TRUE THEN
    UPDATE public.storytelling 
    SET is_primary = FALSE 
    WHERE user_id = NEW.user_id AND id != NEW.id AND is_primary = TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER ensure_single_primary_storytelling
BEFORE INSERT OR UPDATE ON public.storytelling
FOR EACH ROW
EXECUTE FUNCTION public.ensure_single_primary_storytelling();

-- Remove unique constraint on user_id if it exists (to allow multiple storytellings per user)
DO $$
BEGIN
  -- Drop any unique index on user_id alone
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'storytelling' 
    AND indexdef LIKE '%UNIQUE%' 
    AND indexdef LIKE '%user_id%'
    AND indexdef NOT LIKE '%id%user_id%'
  ) THEN
    -- Find and drop the constraint
    EXECUTE (
      SELECT 'ALTER TABLE public.storytelling DROP CONSTRAINT ' || conname
      FROM pg_constraint 
      WHERE conrelid = 'public.storytelling'::regclass 
      AND contype = 'u'
      AND array_length(conkey, 1) = 1
      LIMIT 1
    );
  END IF;
END $$;