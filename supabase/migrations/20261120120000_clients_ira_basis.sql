-- After-tax IRA basis (Form 8606).
--
-- Clients with nondeductible IRA contributions (or after-tax 401(k) money
-- rolled into the IRA) have basis: dollars already taxed. Every IRA dollar out
-- is tax-free pro-rata (remaining basis ÷ year-end value + distributions); see
-- lib/calculations/utils/ira-basis.ts. Requested by Jim Ray (Mike Martin,
-- Nov 2026).
--
-- Cents, like every other money column. NULL / 0 = the whole IRA is pre-tax,
-- so every existing scenario is unchanged.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS ira_basis bigint;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_ira_basis_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_ira_basis_check
  CHECK (ira_basis IS NULL OR ira_basis >= 0);

COMMENT ON COLUMN public.clients.ira_basis IS
  'After-tax basis in the Traditional IRA (Form 8606 line 14), cents. Released tax-free pro-rata from every IRA distribution. NULL/0 = none.';

-- The input is an optional Input Panel feature (key 'ira_basis') that starts
-- OFF for every advisor: append it to every existing advisor's hidden list
-- (existing accounts otherwise default to seeing every feature) and to the
-- default for new accounts. An advisor turns it on in Settings > Input Panel.
UPDATE public.user_settings
  SET hidden_input_features = array_append(hidden_input_features, 'ira_basis')
  WHERE NOT ('ira_basis' = ANY(hidden_input_features));

ALTER TABLE public.user_settings
  ALTER COLUMN hidden_input_features SET DEFAULT ARRAY[
    'ira_basis',
    'qlac',
    'additional_deductions',
    'tax_credits',
    'irmaa_targeting',
    'rmds_external',
    'capital_gains',
    'advisory_fee',
    'aum_allocation',
    'withdrawals',
    'years_to_defer',
    'widow_penalty'
  ]::text[];
