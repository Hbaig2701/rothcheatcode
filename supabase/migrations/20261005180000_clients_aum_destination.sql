-- Where the AUM-allocated slice of the IRA actually goes.
--
-- 'taxable' (the default, and every existing client) is the original behaviour:
-- the slice is pulled OUT of the IRA at ordinary rates and lands in a TAXABLE
-- brokerage, paying an advisory fee plus a dividend drag plus a turnover drag
-- every year after. Nothing converts — set aum_allocation_percent to 100 and
-- the report correctly says "No Roth conversion this scenario".
--
-- 'roth' is what advisors actually mean by "move it to AUM": the money IS Roth
-- converted, and the advisory account is simply where the converted money is
-- managed instead of an annuity. Mechanically the IRA is NOT split at all — the
-- whole balance runs through the normal bracket/IRMAA-aware conversion engine —
-- and aum_allocation_percent becomes the share of each conversion that lands in
-- a MANAGED Roth sleeve growing at aum_growth_rate, with the rest growing at the
-- annuity/Roth rate. Same ordinary tax at conversion, but it lands somewhere
-- with no ongoing tax drag and no RMDs: measured on a $2M IRA to age 95 with a
-- 1% fee on both sides, the Roth destination was worth $1,079,866 more net
-- legacy than routing the same money to the taxable brokerage.
--
-- Guaranteed-income products ignore this and always behave as 'taxable': that
-- engine has its own Roth/income machinery and no managed sleeve, and a
-- half-applied destination would be worse than none. The client form hides the
-- option for GI so it can't be set silently. See
-- lib/calculations/utils/aum-destination.ts.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS aum_destination text;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_aum_destination_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_aum_destination_check
  CHECK (aum_destination IS NULL OR aum_destination IN ('taxable', 'roth'));

COMMENT ON COLUMN public.clients.aum_destination IS
  'Where the AUM-allocated slice goes: taxable (default, null reads as taxable) pulls it out of the IRA into a taxable brokerage and converts nothing; roth Roth-converts it and manages it in a Roth sleeve at aum_growth_rate. Guaranteed-income products always behave as taxable.';
