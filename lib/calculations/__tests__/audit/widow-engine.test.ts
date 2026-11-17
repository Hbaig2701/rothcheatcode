/**
 * Widow's penalty INSIDE the projection (v90).
 *
 * Run: npx tsx lib/calculations/__tests__/audit/widow-engine.test.ts
 *
 * With Widow Analysis on for an MFJ client, the Roth engines (standard /
 * formula.ts, growth, and the shared baseline) switch the survivor to Single
 * from the first-death year (utils/widow.ts). Before v90 the headline stayed
 * married-joint for the whole projection and the widow card was illustration
 * only. What is locked here, for the standard and growth engines:
 *  1. Widow off → every row is MFJ (no behaviour change for anyone else).
 *  2. Widow on → rows BEFORE the death year are identical to widow off.
 *  3. From the death year: filingStatus 'single', spouseAge null, a smaller
 *     standard deduction, and Social Security = the larger check only.
 *  4. IRMAA uses the return from 2 years back: the first two survivor years
 *     still price IRMAA at joint thresholds.
 *  5. Theory: the do-nothing side (IRA left in, RMDs reinvested) ends with
 *     less legacy, and a full conversion's advantage widens.
 */
import type { Client as ClientType } from '../../../types/client';
import { makeClient, dispatch } from './factory';
import { Reporter } from './assertions';
import { getFirstDeathYear } from '../../utils/widow';
import { calculateIRMAA } from '../../modules/irmaa';

const r = new Reporter();
const F = 'widow-engine';

const BASE: Partial<ClientType> = {
  age: 66,
  spouse_age: 70,
  spouse_name: 'Spouse',
  filing_status: 'married_filing_jointly',
  end_age: 95,
  qualified_account_value: 150_000_000, // $1.5M IRA
  taxable_accounts: 30_000_000,
  rate_of_return: 6,
  growth_rate: 6,
  baseline_comparison_rate: 6,
  post_contract_rate: 6,
  ssi_annual_amount: 2_500_000, // $25K
  ssi_payout_age: 66,
  spouse_ssi_annual_amount: 3_000_000, // $30K — the larger check survives
  spouse_ssi_payout_age: 67,
  rmd_treatment: 'reinvested',
  conversion_type: 'full_conversion',
  tax_payment_source: 'from_taxable',
  heir_tax_rate: 40,
  widow_death_age: 80, // older spouse (70) dies at 80
};

const legacy = (y: { traditionalBalance: number; rothBalance: number; taxableBalance: number }) =>
  y.traditionalBalance * 0.6 + y.rothBalance + y.taxableBalance;

for (const blueprint_type of ['fia', 'high-bonus-long-term-growth'] as const) {
  const tag = `${F}/${blueprint_type}`;
  const off = dispatch(makeClient({ ...BASE, blueprint_type, widow_analysis: false }));
  const onClient = makeClient({ ...BASE, blueprint_type, widow_analysis: true });
  const on = dispatch(onClient);
  const death = getFirstDeathYear(onClient);

  for (const side of ['baseline', 'formula'] as const) {
    const O = off[side], N = on[side];
    r.ran();
    if (O.length !== N.length) r.record({ fixture: tag, scenario: side, check: 'row-count', expected: O.length, actual: N.length });
    r.ran();
    if (!N.some((y) => y.year >= death)) r.record({ fixture: tag, scenario: side, check: 'death-in-horizon', note: `death year ${death} outside projection — fixture broken` });

    for (let i = 0; i < N.length; i++) {
      const o = O[i], n = N[i];
      // 1. widow off is married every year
      r.ran();
      if (o.filingStatus !== 'married_filing_jointly') r.record({ fixture: tag, scenario: side, check: 'off-is-mfj', year: o.year, note: `filingStatus ${o.filingStatus}` });

      if (n.year < death) {
        // 2. pre-death identical
        for (const k of ['federalTax', 'stateTax', 'irmaaSurcharge', 'traditionalBalance', 'rothBalance', 'taxableBalance', 'ssIncome', 'conversionAmount'] as const) {
          r.ran();
          if (n[k] !== o[k]) r.record({ fixture: tag, scenario: side, check: 'pre-death-identical', year: n.year, field: k, expected: o[k], actual: n[k] });
        }
        continue;
      }

      // 3. survivor years
      r.ran();
      if (n.filingStatus !== 'single') r.record({ fixture: tag, scenario: side, check: 'survivor-single', year: n.year, note: `filingStatus ${n.filingStatus}` });
      r.ran();
      if (n.spouseAge !== null) r.record({ fixture: tag, scenario: side, check: 'survivor-no-spouse-age', year: n.year, actual: n.spouseAge ?? undefined });
      r.ran();
      if (!((n.standardDeduction ?? 0) < (o.standardDeduction ?? 0))) r.record({ fixture: tag, scenario: side, check: 'survivor-smaller-deduction', year: n.year, expected: o.standardDeduction, actual: n.standardDeduction });
      // Both checks carry the same COLA here, so the survivor keeps 30/55 of the pair.
      const expSS = Math.round(o.ssIncome * 30 / 55);
      r.ran();
      if (Math.abs(n.ssIncome - expSS) > 2) r.record({ fixture: tag, scenario: side, check: 'survivor-larger-ss-only', year: n.year, expected: expSS, actual: n.ssIncome });

      // 4. IRMAA lookback status: joint for the first two survivor years.
      const back = N.find((y) => y.year === n.year - 2);
      if (back && n.age >= 65 && back.magi != null) {
        const status = n.year - 2 < death ? 'married_filing_jointly' : 'single';
        const exp = calculateIRMAA({ magi: back.magi, filingStatus: status, year: n.year }).annualSurcharge;
        r.ran();
        if (Math.abs(n.irmaaSurcharge - exp) > 2) r.record({ fixture: tag, scenario: side, check: 'irmaa-lookback-status', year: n.year, expected: exp, actual: n.irmaaSurcharge, note: `lookback status ${status}` });
      }
    }
  }

  // 5. theory
  const bOff = legacy(off.baseline.at(-1)!), bOn = legacy(on.baseline.at(-1)!);
  r.ran();
  if (!(bOn < bOff)) r.record({ fixture: tag, scenario: 'baseline', check: 'widow-costs-do-nothing', expected: bOff, actual: bOn, note: 'survivor RMD tax should shrink do-nothing legacy' });
  const advOff = legacy(off.formula.at(-1)!) - bOff, advOn = legacy(on.formula.at(-1)!) - bOn;
  r.ran();
  if (!(advOn > advOff)) r.record({ fixture: tag, scenario: 'formula', check: 'widow-widens-full-conversion', expected: advOff, actual: advOn });
}

r.print("Widow's penalty inside the projection (v90)");
process.exit(r.breaches.length > 0 ? 1 : 0);
