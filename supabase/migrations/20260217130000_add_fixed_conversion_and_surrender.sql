-- Add fixed_conversion_amount for fixed dollar conversion strategy
ALTER TABLE clients ADD COLUMN IF NOT EXISTS fixed_conversion_amount bigint;

-- Add surrender_schedule as JSONB array of penalty percentages by year
-- e.g., [16, 14.5, 13, 11.5, 9.5, 8, 6.5, 5, 3, 1]
ALTER TABLE clients ADD COLUMN IF NOT EXISTS surrender_schedule jsonb;
