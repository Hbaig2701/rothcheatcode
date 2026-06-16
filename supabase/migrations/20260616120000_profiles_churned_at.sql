-- Separate the two churn timestamps that were previously collapsed into one.
--
--   canceled_at  = the day the advisor DECIDED to cancel (Stripe subscription.canceled_at).
--                  Set when they hit "cancel"; subscription stays active until period end.
--   churned_at   = the day the subscription ACTUALLY ENDED (Stripe subscription.ended_at).
--                  Set when customer.subscription.deleted fires at period end.
--
-- Before this, customer.subscription.deleted overwrote canceled_at with the
-- deletion timestamp, destroying the decision date. churned_at gives the actual
-- end its own home so canceled_at can stay immutable as the decision date.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS churned_at timestamptz;

COMMENT ON COLUMN profiles.canceled_at IS 'Day the advisor requested cancellation (Stripe subscription.canceled_at). Immutable decision date.';
COMMENT ON COLUMN profiles.churned_at IS 'Day the subscription actually ended (Stripe subscription.ended_at), set on customer.subscription.deleted.';

CREATE INDEX IF NOT EXISTS idx_profiles_churned_at ON profiles(churned_at) WHERE churned_at IS NOT NULL;
