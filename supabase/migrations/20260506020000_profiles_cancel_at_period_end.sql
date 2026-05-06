-- Track Stripe's "cancel at end of period" state on profiles so the admin
-- dashboard can flag advisors who are mid-cancellation BEFORE the
-- subscription actually ends (when subscription_status flips to 'canceled').

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz;

-- Partial index — most rows are false, so a partial index is the right shape
-- for "show me everyone in the cancellation pipeline".
CREATE INDEX IF NOT EXISTS idx_profiles_cancel_at_period_end ON profiles(cancel_at_period_end) WHERE cancel_at_period_end = true;
