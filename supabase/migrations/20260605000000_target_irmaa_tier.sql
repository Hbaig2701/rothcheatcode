-- Add target_irmaa_tier column so advisors can pick which IRMAA tier they
-- want conversions to stay under (only meaningful when constraint_type =
-- 'irmaa_threshold'). Default 'standard' = "no IRMAA surcharge at all" —
-- the most conservative position and what the pre-2026-06-05 engine
-- effectively did when a client was already in Standard. Existing clients
-- get the default on next read; the engine treats NULL as 'standard' too.
--
-- See lib/calculations/scenarios/growth-formula.ts for the engine logic
-- and lib/data/irmaa-brackets.ts:calculateIRMAAHeadroomToTarget for the
-- tier math.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS target_irmaa_tier TEXT NOT NULL DEFAULT 'standard'
    CHECK (target_irmaa_tier IN ('standard', 'tier_1', 'tier_2', 'tier_3', 'tier_4', 'tier_5'));

COMMENT ON COLUMN clients.target_irmaa_tier IS 'Advisor-selected IRMAA tier ceiling. Only consulted when constraint_type = irmaa_threshold. Values: standard (no surcharge) | tier_1..tier_5.';

-- Also migrate the legacy constraint_type values that are now dead code
-- (none and fixed_amount both behaved identically to bracket_ceiling — the
-- engine only ever checked for 'irmaa_threshold'). This idempotent UPDATE
-- collapses them so the form's new value set covers every row. Already run
-- via admin script on 2026-06-05; this re-runs harmlessly if the SQL
-- migration replays on a fresh environment.
UPDATE clients
SET constraint_type = 'bracket_ceiling'
WHERE constraint_type IN ('none', 'fixed_amount');
