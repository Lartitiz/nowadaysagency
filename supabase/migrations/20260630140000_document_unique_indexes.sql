-- ============================================================================
-- Documentation schema-as-code : 3 index UNIQUE d'unicité appliqués via Lovable
-- mais jamais committés dans le repo. Vérifiés présents en prod le 30/06.
--
-- IDEMPOTENT (`IF NOT EXISTS`) : aucun effet en prod (déjà présents), mais corrects
-- sur une base neuve. Le sentinelle `00000000-...-000000000000` traite un
-- workspace_id NULL comme une valeur fixe (même pattern que le reste du schéma),
-- pour que l'unicité tienne aussi en mode solo (workspace_id NULL).
-- ============================================================================

-- Une seule brand_proposition par (user, workspace).
CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_proposition_user_workspace
  ON public.brand_proposition (
    user_id,
    COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- Une seule persona "primary" par (user, workspace).
CREATE UNIQUE INDEX IF NOT EXISTS idx_persona_one_primary
  ON public.persona (
    user_id,
    COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE (is_primary IS TRUE);

-- Un seul storytelling "primary" par (user, workspace).
CREATE UNIQUE INDEX IF NOT EXISTS idx_storytelling_one_primary
  ON public.storytelling (
    user_id,
    COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE (is_primary IS TRUE);
