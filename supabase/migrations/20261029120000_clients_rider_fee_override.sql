-- Per-scenario annual rider fee for Growth products.
--
-- The High-Bonus Growth presets carry a built-in rider fee (0.95%) that was
-- locked and not shown on the form, so advisors saw a fee they "never entered"
-- and could only change it by building a custom product (Ken Orenstein, Oct
-- 2026). Real contracts vary — some carry no rider at all — the same reason the
-- premium bonus is already editable per scenario.
--
-- NULL = use the product's fee (custom product's fees.annual_rider_fee, else
-- the system preset's), so every existing scenario is unchanged. A value is a
-- percentage (0.95 = 0.95%/yr); 0 means no rider fee.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS rider_fee_percent numeric;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_rider_fee_percent_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_rider_fee_percent_check
  CHECK (rider_fee_percent IS NULL OR (rider_fee_percent >= 0 AND rider_fee_percent <= 5));

COMMENT ON COLUMN public.clients.rider_fee_percent IS
  'Growth products only. Annual rider fee %/yr overriding the product''s fee; NULL = use the product (custom product, else system preset).';
