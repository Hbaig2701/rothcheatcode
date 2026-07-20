/**
 * Tests for the OBBA senior bonus deduction ($6,000/person, 65+, 2025–2028).
 * Run with: npx tsx lib/calculations/__tests__/senior-bonus-deduction.test.ts
 */

import { getSeniorBonusDeduction } from '../../data/standard-deductions';

let passed = 0;
let failed = 0;
function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${msg}`);
  }
}

const $ = (dollars: number) => Math.round(dollars * 100); // dollars → cents

// ============================================================
// Eligibility & base amounts (below any phase-out)
// ============================================================
console.log('=== Eligibility & base amounts ===');

// Single 65+, low income → full $6,000
assert(getSeniorBonusDeduction('single', $(40000), 66, undefined, 2026) === $(6000),
  'single 65+ low income → $6,000');
// Single under 65 → $0
assert(getSeniorBonusDeduction('single', $(40000), 64, undefined, 2026) === 0,
  'single under 65 → $0');
// MFJ both 65+ → $12,000
assert(getSeniorBonusDeduction('married_filing_jointly', $(80000), 67, 68, 2026) === $(12000),
  'MFJ both 65+ → $12,000');
// MFJ only one 65+ → $6,000
assert(getSeniorBonusDeduction('married_filing_jointly', $(80000), 67, 60, 2026) === $(6000),
  'MFJ one spouse 65+ → $6,000');
// MFJ neither 65+ → $0
assert(getSeniorBonusDeduction('married_filing_jointly', $(80000), 60, 61, 2026) === 0,
  'MFJ neither 65+ → $0');
// HoH 65+ → $6,000
assert(getSeniorBonusDeduction('head_of_household', $(40000), 70, undefined, 2026) === $(6000),
  'HoH 65+ → $6,000');
console.log('  Done.');

// ============================================================
// Phase-out — verified against IRS worked example
// ============================================================
console.log('=== Phase-out ===');

// IRS example: MFJ, MAGI $178k, both 65+ → $8,640
// excess = 178k - 150k = 28k; reduction/person = 6% * 28k = $1,680;
// per person = 6,000 - 1,680 = 4,320; ×2 = $8,640
assert(getSeniorBonusDeduction('married_filing_jointly', $(178000), 70, 70, 2026) === $(8640),
  'MFJ MAGI $178k both 65+ → $8,640 (IRS example)');

// Single at threshold ($75k) → still full $6,000
assert(getSeniorBonusDeduction('single', $(75000), 66, undefined, 2026) === $(6000),
  'single at $75k threshold → full $6,000');
// Single $100k → 6,000 - 6%*(25k)=1,500 → $4,500
assert(getSeniorBonusDeduction('single', $(100000), 66, undefined, 2026) === $(4500),
  'single MAGI $100k → $4,500');
// Single fully phased out at $175k → $0
assert(getSeniorBonusDeduction('single', $(175000), 66, undefined, 2026) === 0,
  'single MAGI $175k → $0 (fully phased out)');
// Single above full phase-out → still $0 (never negative)
assert(getSeniorBonusDeduction('single', $(300000), 66, undefined, 2026) === 0,
  'single MAGI $300k → $0 (floored)');
// MFJ both, fully phased out at $250k → $0
assert(getSeniorBonusDeduction('married_filing_jointly', $(250000), 70, 70, 2026) === 0,
  'MFJ both 65+ MAGI $250k → $0 (fully phased out)');
console.log('  Done.');

// ============================================================
// Sunset — only tax years 2025–2028
// ============================================================
console.log('=== Sunset window ===');

assert(getSeniorBonusDeduction('single', $(40000), 66, undefined, 2024) === 0,
  '2024 (before OBBA) → $0');
assert(getSeniorBonusDeduction('single', $(40000), 66, undefined, 2025) === $(6000),
  '2025 → $6,000');
assert(getSeniorBonusDeduction('single', $(40000), 66, undefined, 2028) === $(6000),
  '2028 (last year) → $6,000');
assert(getSeniorBonusDeduction('single', $(40000), 66, undefined, 2029) === 0,
  '2029 (sunset) → $0');
console.log('  Done.');

// ============================================================
// Summary
// ============================================================
console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}
