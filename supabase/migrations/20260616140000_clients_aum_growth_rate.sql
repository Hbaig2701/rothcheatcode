-- Separate growth rate for the AUM (managed brokerage) bucket.
--
-- Until now the AUM scenario reused rate_of_return (the annuity/IRA rate) for
-- the brokerage too. Advisors want to model a different return on the managed
-- side (e.g. annuity 5%, AUM 8.5%). Nullable — when unset, the engine falls
-- back to rate_of_return, so existing clients are unchanged.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS aum_growth_rate numeric;

COMMENT ON COLUMN public.clients.aum_growth_rate IS 'Annual growth rate (%) for the AUM brokerage bucket. NULL = use rate_of_return.';
