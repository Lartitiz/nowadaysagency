-- Une inscription neuve n'a encore déclaré aucun canal. Présélectionner
-- Instagram dans « Tu communiques déjà sur… » lui attribue un usage fictif.
ALTER TABLE public.profiles
  ALTER COLUMN canaux SET DEFAULT '{}'::text[];
