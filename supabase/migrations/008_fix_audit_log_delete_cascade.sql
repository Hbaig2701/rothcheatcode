-- Allow CASCADE deletes from clients to clear calculation logs
-- We only block UPDATEs on calculation logs to keep them immutable

CREATE OR REPLACE FUNCTION prevent_calculation_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Calculation logs are immutable - cannot modify';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to calculation_log
DROP TRIGGER IF EXISTS prevent_calculation_log_update ON calculation_log;

CREATE TRIGGER prevent_calculation_log_update
  BEFORE UPDATE ON calculation_log
  FOR EACH ROW EXECUTE FUNCTION prevent_calculation_log_modification();

-- Also apply to audit.calculation_log if it exists
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'audit' AND tablename = 'calculation_log') THEN
    DROP TRIGGER IF EXISTS prevent_audit_log_update ON audit.calculation_log;
    
    CREATE TRIGGER prevent_audit_log_update
      BEFORE UPDATE ON audit.calculation_log
      FOR EACH ROW EXECUTE FUNCTION prevent_calculation_log_modification();
  END IF;
END $$;
