-- Add target_partial_amount for the new 'partial_amount' conversion type.
-- When set, the engine caps cumulative Roth conversions at this dollar amount (in cents).
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS target_partial_amount bigint;
