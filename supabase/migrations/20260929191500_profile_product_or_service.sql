-- Le choix de l'étape « Tu proposes plutôt quoi ? » est distinct du secteur
-- d'activité conservé dans type_activite.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS product_or_service text;

UPDATE public.profiles
SET product_or_service = type_activite
WHERE product_or_service IS NULL
  AND type_activite IN ('produits', 'services', 'les_deux');

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_product_or_service_check
  CHECK (product_or_service IS NULL OR product_or_service IN ('produits', 'services', 'les_deux'));
