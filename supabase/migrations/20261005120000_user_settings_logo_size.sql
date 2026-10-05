-- Advisor-chosen logo size on client-facing PDF reports.
--
-- The cover allowed the logo a 320x100 box and inner-page headers a 240x72
-- box. Those are hard caps on BOTH dimensions, so whichever runs out first
-- decides the printed size. A logo that is wider than it is tall — most
-- firm logos — is stopped by the height, and prints narrower than the width
-- already available to it. Dana Gibson's file is 1800x1000 and printed at
-- roughly 180x100, a tenth of its resolution, with empty cover either side
-- (ticket a40e1b9a, raised via Allan on an onboarding call).
--
-- Rather than pick a size on every advisor's behalf, this is theirs to set.
--
-- DEFAULT 'small' is deliberately the EXACT geometry shipped before this
-- column existed, so no existing report changes until an advisor chooses
-- otherwise. 7 of 16 logos on file are already limited by width rather than
-- height and are unaffected by the larger options regardless.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS logo_size text NOT NULL DEFAULT 'small';

ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS user_settings_logo_size_check;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_logo_size_check
  CHECK (logo_size IN ('small', 'medium', 'large'));

COMMENT ON COLUMN public.user_settings.logo_size IS
  'Printed logo size on PDF reports: small = 320x100 cover / 240x72 header (the pre-2026-10 default, unchanged), medium = 400x140 / 280x90, large = 480x180 / 320x110. Caps on both dimensions; aspect ratio is always preserved, so a wide logo may still be limited by width.';
