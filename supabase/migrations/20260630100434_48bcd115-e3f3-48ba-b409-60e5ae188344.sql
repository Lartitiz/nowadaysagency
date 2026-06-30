-- 1) brand_proposition (mono-ligne : pas d'is_primary)
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000')
      ORDER BY
        (version_final    IS NOT NULL AND version_final    <> '') DESC,
        (version_complete IS NOT NULL AND version_complete <> '') DESC,
        created_at DESC NULLS LAST
    ) AS rn
  FROM brand_proposition
)
DELETE FROM brand_proposition WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

DELETE FROM brand_proposition a
USING brand_proposition b
WHERE a.user_id = b.user_id
  AND a.workspace_id IS NULL
  AND b.workspace_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_proposition_user_workspace
ON brand_proposition (user_id, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'));

-- 2) storytelling (multi-lignes : un seul is_primary)
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000')
      ORDER BY
        (step_7_polished   IS NOT NULL AND step_7_polished   <> '') DESC,
        (step_6_full_story IS NOT NULL AND step_6_full_story <> '') DESC,
        (imported_text     IS NOT NULL AND imported_text     <> '') DESC,
        created_at DESC NULLS LAST
    ) AS rn
  FROM storytelling
  WHERE is_primary IS TRUE
)
UPDATE storytelling SET is_primary = false
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_storytelling_one_primary
ON storytelling (user_id, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'))
WHERE is_primary IS TRUE;

-- 3) persona (multi-lignes : un seul is_primary)
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000')
      ORDER BY
        (step_1_frustrations   IS NOT NULL AND step_1_frustrations   <> '') DESC,
        (step_2_transformation IS NOT NULL AND step_2_transformation <> '') DESC,
        created_at DESC NULLS LAST
    ) AS rn
  FROM persona
  WHERE is_primary IS TRUE
)
UPDATE persona SET is_primary = false
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_persona_one_primary
ON persona (user_id, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'))
WHERE is_primary IS TRUE;