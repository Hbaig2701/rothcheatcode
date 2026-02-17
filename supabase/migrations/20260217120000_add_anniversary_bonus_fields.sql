-- Add anniversary bonus fields for EquiTrust MarketEdge phased bonus structure
-- Premium bonus (bonus_percent) is applied at issue
-- Anniversary bonus is applied at the end of each of the first N years

ALTER TABLE clients ADD COLUMN IF NOT EXISTS anniversary_bonus_percent NUMERIC(5,2) DEFAULT NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS anniversary_bonus_years INTEGER DEFAULT NULL;

COMMENT ON COLUMN clients.anniversary_bonus_percent IS 'Anniversary bonus percentage applied at end of each bonus year (e.g., 4 for 4%)';
COMMENT ON COLUMN clients.anniversary_bonus_years IS 'Number of years the anniversary bonus is applied (e.g., 3)';
