-- Add gi_legacy_mode flag for the guaranteed-income "no income / legacy" mode.
-- When true, the GI engine skips the income phase entirely: the annuity is
-- converted to Roth and held for heirs (no lifetime income, no RMDs), and the
-- benefit base keeps rolling up and is surfaced as the tax-free death benefit
-- (paid to beneficiaries over 5 years). Only meaningful for guaranteed-income
-- products; ignored by growth/standard products. Default false preserves the
-- existing income-projection behavior for every current client.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS gi_legacy_mode boolean NOT NULL DEFAULT false;
