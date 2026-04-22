-- Allow new 'high-bonus-medium-term-growth' product preset (Athene Performance
-- Elite Plus 10 family: 20% bonus, 10-year surrender, 0.95% annual rider fee).
ALTER TABLE clients DROP CONSTRAINT IF EXISTS check_blueprint_type;

ALTER TABLE clients ADD CONSTRAINT check_blueprint_type
  CHECK (blueprint_type IN (
    'fia',
    'short-term-cap-growth',
    'phased-bonus-growth',
    'vesting-bonus-growth',
    'high-bonus-long-term-growth',
    'high-bonus-medium-term-growth',
    'simple-rollup-income',
    'compound-rollup-income',
    'flat-rate-compound-income'
  ));
