-- Backfill: existing phased-bonus-growth clients with bonus_percent=8 (the old preset value)
-- get bumped to 11% to match EquiTrust's current standard offering. This fixes the issue
-- where advisors couldn't manually update the field (it's locked in the form), so without
-- this backfill, every legacy phased-bonus-growth client would silently keep modeling 8%
-- after the preset change in commit 2c1ab65.
--
-- Scope is intentionally narrow: only blueprint_type = 'phased-bonus-growth' AND bonus_percent = 8.
-- A row with bonus_percent intentionally set to a different value (e.g., 7 or 9) is untouched.
UPDATE clients
SET bonus_percent = 11
WHERE blueprint_type = 'phased-bonus-growth'
  AND bonus_percent = 8;
