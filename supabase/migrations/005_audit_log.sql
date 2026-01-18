-- Audit log schema for compliance tracking
-- Append-only table with trigger-enforced immutability

-- Create audit schema
CREATE SCHEMA IF NOT EXISTS audit;

-- Calculation audit log table
CREATE TABLE IF NOT EXISTS audit.calculation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- User context
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Calculation inputs (snapshot)
  input_hash TEXT NOT NULL,              -- SHA256 of client data for deduplication
  client_snapshot JSONB NOT NULL,        -- Full client data at time of calculation

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
CREATE OR REPLACE FUNCTION audit.prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable - cannot modify or delete';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_audit_update
  BEFORE UPDATE OR DELETE ON audit.calculation_log
  FOR EACH ROW EXECUTE FUNCTION audit.prevent_modification();

-- Row Level Security
ALTER TABLE audit.calculation_log ENABLE ROW LEVEL SECURITY;

-- Users can only view their own audit logs
CREATE POLICY "Users view own audit logs"
  ON audit.calculation_log FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own audit logs
CREATE POLICY "Users insert own audit logs"
  ON audit.calculation_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE or DELETE policies - trigger prevents anyway

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_audit_log_client_created
  ON audit.calculation_log(client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_created
  ON audit.calculation_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_input_hash
  ON audit.calculation_log(input_hash);

-- Comment for documentation
COMMENT ON TABLE audit.calculation_log IS
  'Immutable audit log of all calculation runs. Cannot be modified after insertion.';
