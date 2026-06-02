-- ============================================================
-- Onboarding video tracking on user_settings
-- ============================================================
--
-- Drives two product behaviors:
--   1. First-login modal that takes over the screen and points new
--      advisors at /training/onboarding. Modal shows when both
--      dismissed_at and completed_at are NULL.
--   2. Admin funnel — who opened the modal, who started the video,
--      who finished it, where the drop-off happens.
--
-- Three timestamps instead of one status column so we can answer
-- "did they start but not finish?" without losing history. A single
-- enum would force us to pick between "started" and "dismissed"
-- when both happened.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS onboarding_video_dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_video_started_at   timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_video_completed_at timestamptz;

-- Index supports the admin funnel queries (group by completion bucket
-- without scanning the whole table). Cheap on a small advisor base.
CREATE INDEX IF NOT EXISTS idx_user_settings_onboarding_completed
  ON user_settings(onboarding_video_completed_at)
  WHERE onboarding_video_completed_at IS NOT NULL;
