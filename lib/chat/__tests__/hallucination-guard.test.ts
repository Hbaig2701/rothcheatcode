/**
 * Guard regression tests. Run: npx tsx lib/chat/__tests__/hallucination-guard.test.ts
 *
 * Every MUST-FLAG case is a VERBATIM assistant message from a production
 * conversation where an advisor was given wrong information. Every MUST-STAY-
 * SILENT case is a correct answer that an over-eager pattern previously flagged
 * (or would plausibly flag). A guard that cries wolf gets ignored, so the
 * silent cases matter as much as the loud ones.
 */
import { scanAssistantTextForHallucinations as scan } from '../hallucination-guard';

const MUST_FLAG: [string, string][] = [
  ['invented deferral mechanism (Jim Bonadio, 2026-08-24)',
   'The engine is strategically deferring year 1 conversions to preserve the penalty-free allowance for later years when RMDs begin and compete for the same cap.'],
  ['same invention, different client (John Eppolito, 2026-09-16)',
   'The engine strategically defers conversions in year 1 to preserve the penalty-free cap for later years when RMDs begin.'],
  ['invented screen + wrong break-even mechanic (2026-09-17)',
   'The Conversion Cost Payback screen shows when the strategy breaks even - when the Roth IRA balance grows large enough to exceed the cumulative taxes already paid.'],
  ['brackets described as frozen (was in our own system prompt)',
   'Federal brackets are NOT inflation-indexed in this engine - they stay at 2026 values.'],
  ['fabricated SS range (2026-06-01)',
   'The platform only allows payout ages between 62 and 85 (the realistic claiming window).'],
  ['fabricated SS cap (2026-05-29)',
   'That is the ssi_payout_age field (currently locked at 70). The age cap of 70 is not a bug.'],
  ['fabricated SS max (2026-05-28)',
   'The Social Security field has a minimum of 70 and a maximum of 83.'],
];

const MUST_STAY_SILENT: [string, string][] = [
  ['correct break-even definition',
   "Break-even is the first year the strategy's cumulative tax paid falls below the baseline's. For this client it never happens."],
  ['correct year-1 cause',
   "Year 1 converts $0 because the custom product's Year 1 Withdrawal Rule is 0%, so with tax paid from the IRA there is no way to fund it."],
  ['correct bracket indexing',
   'The engine indexes brackets forward 3% a year, so the 24% ceiling is $415,657 in 2027, not $403,550.'],
  ['explicit denial of the invented mechanism',
   'The engine does not strategically defer conversions - that is not a real behavior.'],
  ['correct SS range', 'The Social Security payout age range is 62 to 100, inclusive.'],
  ['denial of the SS cap', 'Social Security payout age is not capped at 70 - the range is 62 to 100.'],
  ['percentage near a SS mention (false positive, fixed 2026-10)',
   'Your Social Security and pensions total $117,766. Minus the standard deduction, that lands him in the 35% bracket.'],
  ['client age near a SS mention (false positive, fixed 2026-10)',
   'John is a high-income earner at age 74 in California, already on Social Security, and not yet in IRMAA surcharges.'],
  ['ordinary correct answer',
   'His conversion fills the 24% bracket exactly: taxable income lands at $403,550.'],
  ['IRMAA indexing', 'IRMAA tiers are inflation-indexed at 2.5% annually.'],
];

let passed = 0;
const failures: string[] = [];
for (const [name, text] of MUST_FLAG) {
  if (scan(text).length) passed++; else failures.push(`MISSED: ${name}`);
}
for (const [name, text] of MUST_STAY_SILENT) {
  const f = scan(text);
  if (!f.length) passed++; else failures.push(`FALSE POSITIVE: ${name} -> ${f.join(' | ')}`);
}
const total = MUST_FLAG.length + MUST_STAY_SILENT.length;
console.log(`=== hallucination guard: ${passed}/${total} ===`);
for (const f of failures) console.log('  ' + f);
process.exit(failures.length ? 1 : 0);
