-- Input Panel customization: optional client-form features an advisor has
-- hidden (keys in lib/input-features.ts). The input form had accumulated
-- one-advisor add-ons (QLAC, tax credits, held-back IRA, AUM, ...) that clutter
-- it for everyone else, especially on demos.
--
-- Hiding is UI-only: the app still shows a hidden feature on any client whose
-- saved values use it, so no projection changes because of this setting.
--
-- Existing accounts keep seeing everything (empty array). New accounts start
-- with every feature hidden: the column DEFAULT is switched AFTER the ADD, so
-- the backfill of existing rows uses '{}' and only rows inserted later get
-- the full list. When adding a key to lib/input-features.ts, add it to this
-- default too (in a new migration) or new accounts will see it.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS hidden_input_features text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.user_settings
  ALTER COLUMN hidden_input_features SET DEFAULT ARRAY[
    'qlac',
    'additional_deductions',
    'tax_credits',
    'irmaa_targeting',
    'rmds_external',
    'capital_gains',
    'advisory_fee',
    'aum_allocation',
    'withdrawals',
    'years_to_defer',
    'widow_penalty'
  ]::text[];

COMMENT ON COLUMN public.user_settings.hidden_input_features IS
  'Optional client-form features this advisor hid in Settings > Input Panel (keys from lib/input-features.ts). UI-only; a hidden feature still shows on clients that use it. Pre-2026-10-09 accounts default to none hidden; new accounts to all hidden.';
