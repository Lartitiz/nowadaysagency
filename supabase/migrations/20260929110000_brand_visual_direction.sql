-- Optional, brand-scoped directions. Existing charter fields and rows are preserved.
ALTER TABLE public.brand_charter
  ADD COLUMN IF NOT EXISTS visual_direction jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS visual_evidence jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.brand_charter.visual_direction IS
  'Editable photo and video direction: light, framing, retouching, composition and motion. Empty values have no effect.';

COMMENT ON COLUMN public.brand_charter.visual_evidence IS
  'Per-field origin and confidence for visual values. Historical fields without an entry have unknown provenance.';
