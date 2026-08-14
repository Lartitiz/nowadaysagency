-- LinkedIn Analytics : connexion DISTINCTE de la publication (platform =
-- 'linkedin_analytics'), scopes r_member_postAnalytics + r_member_profileAnalytics,
-- app développeur séparée ("Nowadays Assistant Analytics"). Même table, même
-- modèle "une ligne par plateforme par (workspace, user)" que les autres.

ALTER TABLE public.social_connections
  DROP CONSTRAINT IF EXISTS social_connections_platform_check;

ALTER TABLE public.social_connections
  ADD CONSTRAINT social_connections_platform_check
  CHECK (platform IN ('instagram', 'linkedin', 'linkedin_analytics', 'canva', 'pinterest', 'google'));