-- ============================================================
-- Replace spouse_ssi_payout_age CHECK with a trigger that raises
-- a clear reason when a value is rejected.
-- ============================================================
--
-- Postgres CHECK errors only return the constraint name
-- ("clients_spouse_ssi_payout_age_check") — advisors saw that raw
-- string in the UI with no explanation of the valid range.
-- A BEFORE INSERT/UPDATE trigger lets us RAISE a human-readable
-- message that survives all the way out through PostgREST.
--
-- Valid range matches the Zod validator: NULL or 62–100.
--   62 = SSA minimum claim age
--   100 = generous upper bound for retroactive entries and clients
--         who delayed claiming past 70

ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_spouse_ssi_payout_age_check;

CREATE OR REPLACE FUNCTION validate_spouse_ssi_payout_age()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.spouse_ssi_payout_age IS NOT NULL
     AND (NEW.spouse_ssi_payout_age < 62 OR NEW.spouse_ssi_payout_age > 100) THEN
    RAISE EXCEPTION
      'Spouse Social Security payout age must be between 62 and 100 (received %). 62 is the SSA minimum claim age; 100 is the upper bound for retroactive entries or clients who delayed claiming.',
      NEW.spouse_ssi_payout_age
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS clients_validate_spouse_ssi_payout_age ON clients;
CREATE TRIGGER clients_validate_spouse_ssi_payout_age
  BEFORE INSERT OR UPDATE OF spouse_ssi_payout_age ON clients
  FOR EACH ROW
  EXECUTE FUNCTION validate_spouse_ssi_payout_age();
