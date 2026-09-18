-- QLAC (Qualified Longevity Annuity Contract). A slice of the IRA (IRS cap
-- $210,000 per person for 2026, indexed in $10K steps) bought as a deferred
-- income annuity at the start of the projection. The premium is excluded from
-- the RMD base, earns no visible account value, gets no premium bonus and is
-- never converted; from the income start age (<= 85) the contract pays a level
-- annual income taxed as ordinary income, with the after-tax proceeds routed
-- per rmd_treatment; a return-of-premium death benefit leaves heirs the
-- unrecovered premium (heir-taxable like a Traditional balance). Strategy
-- side only unless qlac_in_baseline. See lib/calculations/utils/qlac.ts.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS qlac_premium bigint,
  ADD COLUMN IF NOT EXISTS qlac_income_start_age integer,
  ADD COLUMN IF NOT EXISTS qlac_annual_income bigint,
  ADD COLUMN IF NOT EXISTS qlac_death_benefit text,
  ADD COLUMN IF NOT EXISTS qlac_in_baseline boolean;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_qlac_death_benefit_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_qlac_death_benefit_check
  CHECK (qlac_death_benefit IS NULL OR qlac_death_benefit IN ('return_of_premium', 'none'));

COMMENT ON COLUMN public.clients.qlac_premium IS
  'QLAC premium carved out of the IRA at projection start, in cents. Null/0 = feature off. Capped at the IRS per-person limit ($210K for 2026).';
COMMENT ON COLUMN public.clients.qlac_income_start_age IS
  'Age QLAC income begins (must be <= 85, the IRS latest start). Null = 85.';
COMMENT ON COLUMN public.clients.qlac_annual_income IS
  'Level annual QLAC income from the carrier quote, in cents. Taxed as ordinary income from the start age.';
COMMENT ON COLUMN public.clients.qlac_death_benefit IS
  'return_of_premium (heirs get premium minus income received) or none (life-only). Null = return_of_premium.';
COMMENT ON COLUMN public.clients.qlac_in_baseline IS
  'When true the client already owns the QLAC, so it is applied to the do-nothing baseline too (comparison isolates the Roth conversion). Null/false = strategy side only.';

-- Projections: the QLAC's end-of-projection return-of-premium value on each
-- side. Heirs inherit it pre-tax, so every "heir tax = final Traditional x
-- heir rate" surface adds it to the Traditional balance. Null/0 without a QLAC.
ALTER TABLE public.projections
  ADD COLUMN IF NOT EXISTS baseline_final_qlac_death_benefit bigint,
  ADD COLUMN IF NOT EXISTS blueprint_final_qlac_death_benefit bigint;

COMMENT ON COLUMN public.projections.baseline_final_qlac_death_benefit IS
  'QLAC return-of-premium value at the end of the baseline projection, in cents (heir-taxable like Traditional). Null/0 without a QLAC on the baseline.';
COMMENT ON COLUMN public.projections.blueprint_final_qlac_death_benefit IS
  'QLAC return-of-premium value at the end of the strategy projection, in cents (heir-taxable like Traditional). Null/0 without a QLAC.';
