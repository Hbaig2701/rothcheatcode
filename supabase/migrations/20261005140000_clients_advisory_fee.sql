-- Advisory fee on managed assets. Separate control from aum_allocation_percent,
-- which conflates "what I bill on" with "what stays unconverted" (set it to
-- 100% and nothing converts). This fee rides on the ACCOUNT BALANCES
-- (Traditional + Roth + taxable) instead of a carve-out bucket, so an advisor
-- can model "convert the whole IRA to a Roth and I keep managing it".
--
-- advisory_fee_in_baseline defaults to TRUE (null is read as true): the same
-- dollars would have been managed either way, so the do-nothing baseline pays
-- the same fee. Charging the strategy alone would invent a ~1%/yr penalty the
-- baseline never pays and understate the conversion over 30 years. Set it false
-- only when the money genuinely wouldn't be managed without the conversion.
--
-- No tax effect: advisory fees aren't deductible post-TCJA, and a fee paid from
-- an IRA out of its own assets isn't a taxable distribution. Growth + standard
-- engines and the shared baseline; the guaranteed-income engine is excluded on
-- both sides. See lib/calculations/utils/advisory-fee.ts.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS advisory_fee_percent numeric,
  ADD COLUMN IF NOT EXISTS advisory_fee_in_baseline boolean;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_advisory_fee_percent_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_advisory_fee_percent_check
  CHECK (advisory_fee_percent IS NULL OR (advisory_fee_percent >= 0 AND advisory_fee_percent <= 5));

COMMENT ON COLUMN public.clients.advisory_fee_percent IS
  'Annual advisory fee (percent) charged on managed balances: Traditional + Roth + taxable. Null/0 = feature off. No tax effect; reduces balances only.';
COMMENT ON COLUMN public.clients.advisory_fee_in_baseline IS
  'When true (the default — null reads as true) the fee applies to the do-nothing baseline too, so the comparison isolates the tax decision. False charges the strategy side only: correct solely when the money would not be managed without the conversion.';
