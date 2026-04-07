-- Deduplicate: keep most recently updated row per (user_id, workspace_id)
DELETE FROM brand_strategy a
USING brand_strategy b
WHERE a.user_id = b.user_id
  AND COALESCE(a.workspace_id, '00000000-0000-0000-0000-000000000000') = COALESCE(b.workspace_id, '00000000-0000-0000-0000-000000000000')
  AND a.id != b.id
  AND (a.updated_at < b.updated_at OR (a.updated_at = b.updated_at AND a.id < b.id));

-- For users with both NULL and non-NULL workspace_id rows, keep only the workspace_id row
DELETE FROM brand_strategy a
USING brand_strategy b  
WHERE a.user_id = b.user_id
  AND a.workspace_id IS NULL
  AND b.workspace_id IS NOT NULL;

-- Add unique constraint to prevent future duplicates
CREATE UNIQUE INDEX idx_brand_strategy_user_workspace 
ON brand_strategy (user_id, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'));