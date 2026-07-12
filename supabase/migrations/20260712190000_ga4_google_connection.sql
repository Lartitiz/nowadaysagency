-- Google Analytics (GA4) : autoriser la plateforme 'google' dans social_connections.
-- Phase 1 = authentification par compte de service (secrets d'environnement) et une
-- seule propriété. La ligne 'google' n'est pas indispensable au fonctionnement Phase 1
-- (l'id de propriété peut venir de GA4_PROPERTY_ID), mais on ouvre la contrainte dès
-- maintenant pour pouvoir stocker platform_account_id = id de la propriété GA4.

ALTER TABLE public.social_connections
  DROP CONSTRAINT IF EXISTS social_connections_platform_check;

ALTER TABLE public.social_connections
  ADD CONSTRAINT social_connections_platform_check
  CHECK (platform IN ('instagram', 'linkedin', 'canva', 'pinterest', 'google'));
