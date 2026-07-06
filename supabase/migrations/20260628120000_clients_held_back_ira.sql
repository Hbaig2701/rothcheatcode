-- Held-back Traditional IRA (income overlay). Money the client keeps as a plain
-- Traditional IRA OUTSIDE this annuity (e.g. left at another custodian), not
-- being converted. When rmds_handled_externally is on and this balance > 0, the
-- projections route auto-computes that IRA's RMDs (growing + depleting the
-- balance) and folds them into ordinary income for BOTH the baseline and the
-- strategy, so the Roth conversion is taxed in the correct brackets instead of
-- in a vacuum. Income-only overlay; the held-back balance's own wealth/heir tax
-- are NOT added to net-worth totals (a wash on the comparison delta).
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS held_back_ira_balance bigint,
  ADD COLUMN IF NOT EXISTS held_back_ira_growth_rate numeric;

COMMENT ON COLUMN public.clients.held_back_ira_balance IS
  'Held-back Traditional IRA balance (outside this annuity), in cents. Its RMDs are folded into ordinary income so the conversion is taxed in the right brackets. Null/0 = feature off.';
COMMENT ON COLUMN public.clients.held_back_ira_growth_rate IS
  'Annual growth rate (percent) on the held-back IRA balance; affects each year''s RMD. Null falls back to rate_of_return.';
