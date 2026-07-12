-- Banque de convictions vécues (chantier différenciation idées, 12/07/2026).
-- 4 champs de matière brute « spiky » sur brand_profile, remplis UNIQUEMENT
-- via le coaching « Ma voix & mes combats » (jamais auto-générés par l'IA).
ALTER TABLE public.brand_profile
  ADD COLUMN IF NOT EXISTS conviction_pairs text,
  ADD COLUMN IF NOT EXISTS conviction_shift text,
  ADD COLUMN IF NOT EXISTS conviction_verbatims text,
  ADD COLUMN IF NOT EXISTS conviction_unspoken text;
