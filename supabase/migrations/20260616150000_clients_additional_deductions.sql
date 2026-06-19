-- Additional deductions beyond the standard deduction (charitable/itemized,
-- business losses/NOLs, leveraged-deduction programs), stored in cents.
-- The engine adds this on top of the standard deduction when computing taxable
-- income, which lowers the tax on Roth conversions shielded by the deduction.
-- Nullable; null/absent is treated as 0 by getEffectiveDeduction().
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS additional_deductions bigint;

COMMENT ON COLUMN public.clients.additional_deductions IS
  'Annual deductions beyond the standard deduction, in cents (added on top of the standard deduction). Null = 0.';
