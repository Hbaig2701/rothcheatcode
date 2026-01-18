-- Projections table for storing simulation results
-- Note: user_id references profiles(id) to match clients table pattern
DROP TABLE IF EXISTS projections;

CREATE TABLE projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  input_hash TEXT NOT NULL,

  break_even_age INTEGER,
  total_tax_savings BIGINT NOT NULL,
  heir_benefit BIGINT NOT NULL,

  baseline_final_traditional BIGINT NOT NULL,
  baseline_final_roth BIGINT NOT NULL,
  baseline_final_taxable BIGINT NOT NULL,
  baseline_final_net_worth BIGINT NOT NULL,

  blueprint_final_traditional BIGINT NOT NULL,
  blueprint_final_roth BIGINT NOT NULL,
  blueprint_final_taxable BIGINT NOT NULL,
  blueprint_final_net_worth BIGINT NOT NULL,

  baseline_years JSONB NOT NULL,
  blueprint_years JSONB NOT NULL,

  strategy TEXT NOT NULL,
  projection_years INTEGER NOT NULL
);

CREATE INDEX idx_projections_client_id ON projections(client_id);
CREATE INDEX idx_projections_created_at ON projections(client_id, created_at DESC);

ALTER TABLE projections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projections"
  ON projections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own projections"
  ON projections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own projections"
  ON projections FOR DELETE
  USING (auth.uid() = user_id);
