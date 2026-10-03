-- Passe zoomée « fidélité produit » du Studio visuel (03/10/2026) : une 2e
-- génération Higgsfield synchrone par intégration produit. Elle n'a pas de ligne
-- studio_image_requests à elle ; sa réservation vit dans higgsfield_image_spend
-- (même budget mensuel, même verrou). Sans cette migration, la réservation est
-- refusée et le Studio livre simplement l'image de la 1re passe.
ALTER TABLE public.higgsfield_image_spend DROP CONSTRAINT IF EXISTS higgsfield_image_spend_source_check;
ALTER TABLE public.higgsfield_image_spend ADD CONSTRAINT higgsfield_image_spend_source_check
 CHECK(source IN ('carousel-slide-image','product-on-model','visual-studio'));
