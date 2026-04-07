-- Update blueprint_type CHECK constraint to allow new product preset
ALTER TABLE clients DROP CONSTRAINT IF EXISTS check_blueprint_type;

ALTER TABLE clients ADD CONSTRAINT check_blueprint_type
  CHECK (blueprint_type IN (
    'fia',
    'short-term-cap-growth',
    'phased-bonus-growth',
    'vesting-bonus-growth',
    'high-bonus-long-term-growth',
    'simple-rollup-income',
    'compound-rollup-income',
    'flat-rate-compound-income'
  ));
