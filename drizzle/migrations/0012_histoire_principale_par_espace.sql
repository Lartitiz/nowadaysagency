-- 24/10/2026 : une histoire enregistrée dans un espace faisait perdre son statut
-- « principale » à l'histoire d'un AUTRE espace de la même personne.
--
-- Vu en vrai sur le compte test Camille (essai de « Je corrige » à la relecture
-- de la fiche) : l'histoire créée dans l'espace « Camille » a passé à
-- is_primary = false celle de l'espace « Laetitia ». Or la fiche, la synthèse,
-- le coaching et « Mon histoire » ne lisent que l'histoire principale
-- (.eq("is_primary", true)) : dans l'autre espace, l'histoire disparaissait.
--
-- Cause : le déclencheur de février (20260220225236) ne regarde que user_id et
-- part sur CHAQUE mise à jour d'une histoire principale. Le 30/06
-- (20260630113622) un déclencheur par espace l'a remplacé
-- (trg_storytelling_single_primary, enforce_single_primary), mais l'ancien
-- n'a jamais été retiré : les deux tournent.

-- 1) Retirer l'ancien déclencheur. Celui du 30/06 garde « une seule principale
--    par personne ET par espace ».
DROP TRIGGER IF EXISTS ensure_single_primary_storytelling ON public.storytelling;
DROP FUNCTION IF EXISTS public.ensure_single_primary_storytelling();

-- 2) Rendre une principale aux espaces qui l'ont perdue : dans chaque couple
--    (personne, espace) qui a des histoires mais aucune principale, la plus
--    remplie (même ordre que la remise en ordre du 30/06, 20260630100434).
WITH sans_principale AS (
  SELECT user_id, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000') AS espace
  FROM public.storytelling
  GROUP BY 1, 2
  HAVING NOT bool_or(is_primary IS TRUE)
),
ranked AS (
  SELECT s.id,
    ROW_NUMBER() OVER (
      PARTITION BY s.user_id, COALESCE(s.workspace_id, '00000000-0000-0000-0000-000000000000')
      ORDER BY
        (s.step_7_polished   IS NOT NULL AND s.step_7_polished   <> '') DESC,
        (s.step_6_full_story IS NOT NULL AND s.step_6_full_story <> '') DESC,
        (s.imported_text     IS NOT NULL AND s.imported_text     <> '') DESC,
        s.updated_at DESC NULLS LAST
    ) AS rn
  FROM public.storytelling s
  JOIN sans_principale g
    ON g.user_id = s.user_id
   AND g.espace = COALESCE(s.workspace_id, '00000000-0000-0000-0000-000000000000')
)
UPDATE public.storytelling SET is_primary = true
WHERE id IN (SELECT id FROM ranked WHERE rn = 1);