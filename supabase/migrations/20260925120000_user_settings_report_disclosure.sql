-- Firm disclosure line for client-facing reports.
--
-- Securities-licensed advisors (Series 6/7/65 etc.) must carry their
-- broker-dealer's or RIA's approved disclosure on every client-facing
-- communication (FINRA Rule 2210). The built-in report disclaimer is written
-- for insurance producers and does not satisfy that, so a registered rep
-- cannot hand our reports to a client without their own language on them.
--
-- Free text authored entirely by the advisor — we never supply, default, or
-- suggest disclosure wording, since getting someone else's compliance text
-- wrong is their violation and our liability.
--
-- Deliberately PER-USER, not per-subscription (unlike the shared logo): two
-- reps under one subscription can be registered with different broker-dealers,
-- and printing the wrong firm's disclosure is worse than printing none.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS report_disclosure text;

COMMENT ON COLUMN public.user_settings.report_disclosure IS
  'Advisor-authored compliance disclosure printed on client-facing reports and PDFs (e.g. "Securities offered through X, Member FINRA/SIPC"). Per-user, never shared across a subscription. Null/empty = no disclosure block rendered.';
