-- Toggle for split-bucket Roth conversion strategies: when the advisor is
-- modeling ONLY part of a client's IRA (e.g., $1.3M moves to Athene for
-- conversion, $1.2M stays at Fidelity), RMDs are typically taken from the
-- bucket NOT being modeled here. Without this toggle, the engine computes
-- RMDs on the modeled bucket and they eat into the conversion target —
-- e.g., Greg Stopp's Policar case: $1.3M Partial Amount target was only
-- hitting ~$1.17M because RMDs were drawing from the same bucket.
--
-- When this flag is true:
--   - Baseline scenario skips RMD computation entirely
--   - Strategy scenario skips RMD computation entirely
--   - Year-by-year tables hide the RMD column
--   - Story Mode suppresses the "RMDs Would Start Now" milestone
--   - PDF reports skip the "Tax on RMDs" section
--   - rmd_treatment dropdown becomes irrelevant (UI hides it)
--
-- Advisor takes responsibility for adding the external RMD as Other Income
-- in Section 5 if they want the full tax picture. Both baseline and strategy
-- are gated equally so the strategy-vs-baseline delta remains apples-to-apples.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS rmds_handled_externally boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clients.rmds_handled_externally IS
  'When true, the engine skips RMD calculation on this client''s modeled IRA bucket (for both baseline and strategy). Use for split-bucket strategies where RMDs are taken from an outside IRA not modeled here.';
