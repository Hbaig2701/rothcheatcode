/**
 * Preferential income + AUM-pull MAGI — value verification (v81).
 *
 * Run: npx tsx lib/calculations/__tests__/audit/preferential-income-and-aum-magi.test.ts
 *
 * 1. Income rows typed capital_gains / qualified_dividends are excluded from
 *    ordinary taxable income, taxed at the flat ltcg_rate (inside federalTax),
 *    and counted toward MAGI. Rows typed 'other' are ordinary. 'dividends'
 *    (Dividends & Interest) is unchanged — ordinary.
 * 2. external_magi_income_by_year (the AUM bucket's IRA pulls) counts toward
 *    the IRMAA cap headroom and the 2-year lookback, so with the cap on
 *    Standard, Roth-side MAGI + external stays under the single Standard
 *    threshold, and the tier/surcharge reflect the combined MAGI.
 */
import type { Client, NonSSIIncomeEntry } from '../../../types/client';
import { makeClient, dispatch } from './factory';
import { Reporter } from './assertions';
import { calculateIRMAA } from '../../modules/irmaa';
import { calculateIRMAAHeadroom } from '../../../data/irmaa-brackets';

const r = new Reporter();
const TOL = 100;

function rows(type: NonNullable<NonSSIIncomeEntry['type']>, amountCents: number, startAge: number, n = 30) {
  return Array.from({ length: n }, (_, i) => ({
    age: String(startAge + i), year: 2026 + i, type, gross_taxable: amountCents, tax_exempt: 0,
  }));
}

// ---- 1. preferential income ------------------------------------------------
{
  const base: Partial<Client> = {
    age: 71, end_age: 90, filing_status: 'single', qualified_account_value: 100_000_000,
    conversion_type: 'no_conversion', taxable_accounts: 0, tax_payment_source: 'from_ira',
    ssi_annual_amount: 0, ssi_payout_age: 71, ltcg_rate: 15, rmd_treatment: 'reinvested',
    bonus_percent: 0, rate_of_return: 6, baseline_comparison_rate: 6, post_contract_rate: 6,
  };
  const amt = 4_000_000; // $40,000
  const ordinary = dispatch(makeClient({ ...base, non_ssi_income: rows('other', amt, 71) } as Partial<Client>), 2026).baseline[0];
  for (const t of ['capital_gains', 'qualified_dividends'] as const) {
    const pref = dispatch(makeClient({ ...base, non_ssi_income: rows(t, amt, 71) } as Partial<Client>), 2026).baseline[0];
    r.ran();
    const expectedLtcg = Math.round(amt * 0.15);
    const ok =
      (pref.preferentialIncome ?? 0) === amt &&
      (pref.otherIncome ?? 0) === 0 &&
      Math.abs((pref.taxableIncome ?? 0)) <= TOL &&                       // no ordinary income at all
      Math.abs((pref.magi ?? 0) - amt) <= TOL &&                          // still in MAGI
      Math.abs((pref.ltcgTax ?? 0) - expectedLtcg) <= TOL &&
      Math.abs((pref.federalTax ?? 0) - expectedLtcg) <= TOL &&           // LTCG tax rides inside federalTax
      (ordinary.taxableIncome ?? 0) > 0 && (ordinary.federalTax ?? 0) !== (pref.federalTax ?? 0);
    if (!ok) r.record({ fixture: `pref/${t}`, scenario: 'baseline', check: 'preferential-income-treatment', year: 2026, age: 71, note: `pref=${pref.preferentialIncome} other=${pref.otherIncome} taxable=${pref.taxableIncome} magi=${pref.magi} ltcg=${pref.ltcgTax} fed=${pref.federalTax} (ordinary fed=${ordinary.federalTax})` });
  }
  // 'dividends' (Dividends & Interest) must be unchanged: ordinary.
  const div = dispatch(makeClient({ ...base, non_ssi_income: rows('dividends', amt, 71) } as Partial<Client>), 2026).baseline[0];
  r.ran();
  if ((div.otherIncome ?? 0) !== amt || (div.ltcgTax ?? 0) !== 0 || Math.abs((div.federalTax ?? 0) - (ordinary.federalTax ?? 0)) > TOL) {
    r.record({ fixture: 'pref/dividends', scenario: 'baseline', check: 'dividends-stay-ordinary', year: 2026, age: 71, note: `other=${div.otherIncome} ltcg=${div.ltcgTax} fed=${div.federalTax} vs ordinary fed=${ordinary.federalTax}` });
  }
}

// ---- 2. external MAGI (AUM pulls) vs the IRMAA cap -------------------------
{
  const external: Record<number, number> = {};
  for (let y = 2026; y <= 2031; y++) external[y] = 2_000_000; // $20k/yr pulled by the AUM bucket
  const base: Partial<Client> = {
    age: 67, end_age: 85, filing_status: 'single', qualified_account_value: 40_000_000,
    conversion_type: 'optimized_amount', max_tax_rate: 22, constraint_type: 'irmaa_threshold',
    target_irmaa_tier: 'standard', tax_payment_source: 'from_ira', taxable_accounts: 0,
    ssi_annual_amount: 2_500_000, ssi_payout_age: 67, bonus_percent: 0,
    rate_of_return: 7, baseline_comparison_rate: 7, post_contract_rate: 7, rmd_treatment: 'reinvested',
    non_ssi_income: rows('other', 2_000_000, 67, 20),
  };
  const without = dispatch(makeClient(base as Partial<Client>), 2026).formula;
  const withExt = dispatch(makeClient({ ...base, external_magi_income_by_year: external } as Partial<Client>), 2026).formula;
  const history = new Map<number, number>();
  for (const y of withExt) {
    const ext = external[y.year] ?? 0;
    const combined = (y.magi ?? 0) + ext;
    const cap = calculateIRMAAHeadroom(0, false, y.year); // single Standard upper threshold for that year
    if ((y.conversionAmount ?? 0) > 0 && ext > 0) {
      r.ran();
      if (combined > cap) r.record({ fixture: 'aum-magi/cap', scenario: 'formula', check: 'irmaa-cap-holds-with-external', year: y.year, age: y.age, expected: cap, actual: combined, delta: combined - cap, note: `conv ${y.conversionAmount}, ext ${ext}` });
      const old = without.find((o) => o.year === y.year);
      r.ran();
      if (old && (old.conversionAmount ?? 0) <= (y.conversionAmount ?? 0) + TOL && (old.magi ?? 0) + ext > cap) {
        r.record({ fixture: 'aum-magi/cap', scenario: 'formula', check: 'conversion-shrinks-for-external', year: y.year, age: y.age, expected: old.conversionAmount, actual: y.conversionAmount, note: 'conversion did not shrink to make room for the external pull' });
      }
    }
    history.set(y.year, combined);
    // Tier/surcharge must reflect the COMBINED lookback MAGI.
    const lb = history.get(y.year - 2);
    if (lb != null && y.age >= 65) {
      r.ran();
      const expected = calculateIRMAA({ magi: lb, filingStatus: 'single', year: y.year });
      if (expected.tier !== (y.irmaaTier ?? 0) || Math.abs(expected.annualSurcharge - (y.irmaaSurcharge ?? 0)) > TOL) {
        r.record({ fixture: 'aum-magi/lookback', scenario: 'formula', check: 'tier-surcharge-on-combined-lookback', year: y.year, age: y.age, expected: expected.annualSurcharge, actual: y.irmaaSurcharge ?? 0, note: `tier ${y.irmaaTier} vs expected ${expected.tier} on combined lookback MAGI ${lb}` });
      }
    }
  }
}

r.print('Preferential income + AUM-pull MAGI — value checks');
process.exit(r.breaches.length > 0 ? 1 : 0);
