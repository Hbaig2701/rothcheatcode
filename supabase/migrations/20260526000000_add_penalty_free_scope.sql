-- ============================================================
-- Add penalty_free_scope to clients
-- ============================================================
--
-- When respect_penalty_free_limit is true, the engine has historically
-- capped only the TAX paid from the IRA (Joshua W.'s interpretation: a
-- Roth conversion is an intra-carrier Trad → Roth transfer, so no money
-- physically leaves the contract and the carrier's penalty-free
-- allowance is not tripped). That matches some carriers (e.g., Allianz
-- when the conversion stays inside the same contract).
--
-- Other advisors (Ben M.) read carrier penalty-free language more
-- strictly: ANY distribution from the qualified IRA — including the
-- conversion itself — counts toward the 10%. That matches other
-- carriers and a more conservative interpretation of the contract.
--
-- Rather than picking one and breaking the other, expose it as a
-- per-client choice. Default to 'tax_only' so EVERY existing client
-- keeps the exact behavior they have today.
--
-- Values:
--   'tax_only'         — only the tax dollars paid from the IRA count
--                        against the cap. Conversions are an intra-carrier
--                        transfer and don't trip the allowance. (default)
--   'all_distributions' — conversion + RMD + tax-from-IRA all count
--                        toward the cap. Strict carrier interpretation.
--                        Forces the engine to size conversions smaller.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS penalty_free_scope text NOT NULL DEFAULT 'tax_only';

ALTER TABLE clients
  ADD CONSTRAINT clients_penalty_free_scope_check
  CHECK (penalty_free_scope IN ('tax_only', 'all_distributions'));
