-- Add respect_penalty_free_limit flag for Allianz/American Equity-style carrier limits.
-- When true, the engine caps each year's Roth conversion at
-- penalty_free_percent × beginning-of-year IRA balance — modeling contracts that
-- prohibit conversions beyond the free-withdrawal allowance without surrender charges.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS respect_penalty_free_limit boolean NOT NULL DEFAULT false;
