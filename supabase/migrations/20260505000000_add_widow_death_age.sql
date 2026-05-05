-- Advisor-controlled death age for the widow's penalty analysis.
-- Previously the analyzer used a fixed heuristic (older spouse's birth year + 85)
-- with no UI to override. Advisors illustrating spouses in poor health (or with
-- different planning assumptions) had no way to anchor the analysis to a
-- specific year/age. This column lets them set "first to die at age N" — the
-- analyzer converts to a calendar year using the older spouse's birth year.
--
-- Nullable so existing clients fall back to the default heuristic. Range
-- 60-100 covers reasonable planning assumptions; the engine clamps if needed.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS widow_death_age integer;
