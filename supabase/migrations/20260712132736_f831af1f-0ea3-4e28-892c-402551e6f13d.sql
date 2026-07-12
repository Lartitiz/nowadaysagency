ALTER TABLE public.social_connections DROP CONSTRAINT IF EXISTS social_connections_platform_check;
ALTER TABLE public.social_connections ADD CONSTRAINT social_connections_platform_check
  CHECK (platform IN ('instagram','linkedin','canva','pinterest','google'));