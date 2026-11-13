-- « Tu proposes plutôt quoi ? » : 4e réponse « Des biens ou des réalisations »
-- (choix de Laetitia du 13/11/2026 : marchandes de biens, artisanes, pièces
-- uniques…). La contrainte du 29/09/2026 ne connaissait que trois valeurs.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_product_or_service_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_product_or_service_check
  CHECK (product_or_service IS NULL OR product_or_service IN ('produits', 'services', 'realisations', 'les_deux'));
