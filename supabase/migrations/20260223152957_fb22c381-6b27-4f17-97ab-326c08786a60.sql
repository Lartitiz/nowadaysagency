
-- Add email column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (email);

-- Populate email from auth.users
UPDATE public.profiles
SET email = au.email
FROM auth.users au
WHERE au.id = profiles.user_id
AND profiles.email IS NULL;

-- Create trigger to auto-copy email on new profile creation
CREATE OR REPLACE FUNCTION public.copy_email_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.email IS NULL THEN
    SELECT email INTO NEW.email FROM auth.users WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_copy_email_on_profile
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.copy_email_from_auth();
