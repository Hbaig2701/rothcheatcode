-- ============================================================
-- Raise spouse_ssi_payout_age cap from 70 → 100
-- ============================================================
--
-- Commit fbc4d30 raised the cap from 70 to 100 in the form input
-- (components/clients/sections/taxable-income.tsx) and the Zod
-- validators (lib/validations/client.ts), but missed the database
-- CHECK constraint on spouse_ssi_payout_age. Result: advisors can
-- enter values > 70 in the UI, validation passes, then the INSERT
-- fails with `clients_spouse_ssi_payout_age_check`.
--
-- Greg Stopp hit this on 2026-06-01 for Dr. Michael Policar (age 75,
-- already claiming SS). The primary ssi_payout_age and ss_start_age
-- columns did not have this constraint, so only the spouse field was
-- broken — which matches the symptom.
--
-- New range matches Zod: NULL (no spouse) OR 62 ≤ age ≤ 100.

ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_spouse_ssi_payout_age_check;

ALTER TABLE clients
  ADD CONSTRAINT clients_spouse_ssi_payout_age_check
  CHECK (
    spouse_ssi_payout_age IS NULL
    OR (spouse_ssi_payout_age >= 62 AND spouse_ssi_payout_age <= 100)
  );
