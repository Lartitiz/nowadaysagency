-- Add combat columns to brand_profile
ALTER TABLE brand_profile ADD COLUMN IF NOT EXISTS combat_cause TEXT DEFAULT '';
ALTER TABLE brand_profile ADD COLUMN IF NOT EXISTS combat_fights TEXT DEFAULT '';
ALTER TABLE brand_profile ADD COLUMN IF NOT EXISTS combat_alternative TEXT DEFAULT '';
ALTER TABLE brand_profile ADD COLUMN IF NOT EXISTS combat_refusals TEXT DEFAULT '';

-- Migrate data from brand_niche to brand_profile where possible
UPDATE brand_profile bp
SET 
  combat_cause = COALESCE(bn.step_1a_cause, ''),
  combat_fights = COALESCE(bn.step_1b_combats, ''),
  combat_alternative = COALESCE(bn.step_1c_alternative, ''),
  combat_refusals = COALESCE(bn.step_2_refusals, '')
FROM brand_niche bn
WHERE bn.user_id = bp.user_id
  AND (bn.step_1a_cause IS NOT NULL OR bn.step_1b_combats IS NOT NULL OR bn.step_1c_alternative IS NOT NULL OR bn.step_2_refusals IS NOT NULL);

-- Drop cloud columns from brand_strategy
ALTER TABLE brand_strategy DROP COLUMN IF EXISTS cloud_offer;
ALTER TABLE brand_strategy DROP COLUMN IF EXISTS cloud_clients;
ALTER TABLE brand_strategy DROP COLUMN IF EXISTS cloud_universe;
ALTER TABLE brand_strategy DROP COLUMN IF EXISTS ai_words;

-- Drop the brand_niche table
DROP TABLE IF EXISTS brand_niche;
