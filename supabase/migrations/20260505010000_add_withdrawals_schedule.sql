-- Voluntary withdrawals schedule (in addition to RMDs and Roth conversions).
--
-- Advisor use case: prospect retiring at 70 needs to pull $50K/yr from
-- IRA / Roth in addition to SS + outside income. Without this schedule
-- the projection assumes all retirement spending comes from outside the
-- portfolio, which understates portfolio drawdown and overstates legacy.
--
-- Each row in the array is one year's withdrawal:
--   { year: number, amount: number (cents), source: 'ira'|'roth'|'auto' }
--
-- 'auto' = pull from Roth first (tax-free), fall back to IRA — gives the
-- natural per-scenario comparison: baseline pulls from IRA (no Roth to
-- speak of); strategy pulls from Roth (after conversions accumulate).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS withdrawals jsonb NOT NULL DEFAULT '[]'::jsonb;
