-- Allow new 'generic-income' product preset (fully customizable income annuity,
-- mirrors the 'fia' Generic Growth Product pattern on the income side).
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
    'flat-rate-compound-income',
    'generic-income'
  ));
