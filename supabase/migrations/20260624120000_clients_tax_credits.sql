-- Advisor-entered TAX CREDITS available to the client, stored in cents.
-- Unlike additional_deductions (which reduces taxable INCOME), a credit offsets
-- tax OWED dollar-for-dollar. Modeled as a CARRYFORWARD POOL: this is the total
-- available credit (e.g. a $300K Hurricane disaster-relief carryover). The
-- engine draws it down against each year's FEDERAL INCOME TAX, floored at $0,
-- carrying the unused balance forward until the pool is exhausted.
--
-- Scope is deliberate (see lib/calculations/utils/tax-credits.ts): FEDERAL
-- income tax ONLY. Credits do NOT offset the IRMAA surcharge, the 10% early-
-- withdrawal penalty, or state tax, and they do NOT change taxable income,
-- AGI/MAGI, the marginal bracket, or the IRMAA tier (that's what distinguishes
-- a credit from a deduction).
-- Nullable; null/absent is treated as 0 (no credit).
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS tax_credits bigint;

COMMENT ON COLUMN public.clients.tax_credits IS
  'Total available tax CREDIT pool, in cents (carryforward). Offsets federal income tax dollar-for-dollar until exhausted. Null = 0.';
