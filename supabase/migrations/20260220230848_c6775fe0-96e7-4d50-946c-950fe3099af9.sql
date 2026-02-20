
-- Add new version columns
ALTER TABLE brand_proposition ADD COLUMN IF NOT EXISTS version_pitch_naturel TEXT;
ALTER TABLE brand_proposition ADD COLUMN IF NOT EXISTS version_bio TEXT;
ALTER TABLE brand_proposition ADD COLUMN IF NOT EXISTS version_networking TEXT;
ALTER TABLE brand_proposition ADD COLUMN IF NOT EXISTS version_site_web TEXT;
ALTER TABLE brand_proposition ADD COLUMN IF NOT EXISTS version_engagee TEXT;
ALTER TABLE brand_proposition ADD COLUMN IF NOT EXISTS version_one_liner TEXT;
