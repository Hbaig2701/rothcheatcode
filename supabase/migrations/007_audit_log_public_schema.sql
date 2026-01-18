-- Audit log in public schema (more compatible with Supabase JS client)
-- The audit schema approach requires additional API configuration

-- Create calculation audit log table in public schema
CREATE TABLE IF NOT EXISTS calculation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- User context
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Calculation inputs (snapshot)
  input_hash TEXT NOT NULL,
  client_snapshot JSONB NOT NULL,

  -- Strategy used
  strategy TEXT NOT NULL,

  -- Calculation outputs (summary)
  break_even_age INTEGER,
  total_tax_savings BIGINT NOT NULL,
  heir_benefit BIGINT NOT NULL,

  -- Final wealth comparison (cents)
  baseline_final_wealth BIGINT NOT NULL,
  blueprint_final_wealth BIGINT NOT NULL,

  -- Performance tracking
  calculation_ms INTEGER,

  -- Version tracking
  engine_version TEXT NOT NULL DEFAULT '1.0.0'
);

-- Prevent updates and deletes (immutability enforcement)
CREATE OR REPLACE FUNCTION prevent_calculation_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Calculation logs are immutable - cannot modify or delete';
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS prevent_calculation_log_update ON calculation_log;

CREATE TRIGGER prevent_calculation_log_update
  BEFORE UPDATE OR DELETE ON calculation_log
  FOR EACH ROW EXECUTE FUNCTION prevent_calculation_log_modification();

-- Row Level Security
ALTER TABLE calculation_log ENABLE ROW LEVEL SECURITY;

-- Users can only view their own audit logs
DROP POLICY IF EXISTS "Users view own calculation logs" ON calculation_log;
CREATE POLICY "Users view own calculation logs"
  ON calculation_log FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own audit logs
DROP POLICY IF EXISTS "Users insert own calculation logs" ON calculation_log;
CREATE POLICY "Users insert own calculation logs"
  ON calculation_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_calculation_log_client_created
  ON calculation_log(client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_calculation_log_user_created
  ON calculation_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_calculation_log_input_hash
  ON calculation_log(input_hash);

-- Comment for documentation
COMMENT ON TABLE calculation_log IS
  'Immutable audit log of all calculation runs. Cannot be modified after insertion.';
