-- Add new columns to calendar_shares for guest edit permissions and view options
ALTER TABLE public.calendar_shares
  ADD COLUMN IF NOT EXISTS guest_can_edit_status boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS guest_can_edit_wording boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS view_mode text NOT NULL DEFAULT 'table',
  ADD COLUMN IF NOT EXISTS show_columns jsonb NOT NULL DEFAULT '["theme","status","date","wording","canal","format","phase"]'::jsonb;