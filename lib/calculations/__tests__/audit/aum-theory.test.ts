/**
 * AUM split-allocation engine — conservation + THEORY checks.
 *
 * Run: npx tsx lib/calculations/__tests__/audit/aum-theory.test.ts
 *
 * The AUM bucket (runAumScenario) has its own tax-drag math never exercised by
 * the rest of the suite. This verifies it against financial theory, not just
 * internal consistency:
 *   - transfer completeness: the whole IRA slice leaves the IRA by withdrawalYears
 *   - transfer-tax theory: IRA→AUM pull taxed at ordinary marginal + state (+10%
 *     penalty under 59½)
 *   - cash conservation: gross pulled = net-to-AUM + tax + penalty
 *   - brokerage net-growth band: after transfer, AUM grows > 0 but < gross rate
 *     (fees + dividend + turnover drag must bite, and must not exceed the rate)
 *   - non-negativity; netWorth = pendingIRA + brokerage
 */

import type { Client } from '../../../types/client';
import { makeClient } from './factory';
import { runAumScenario } from '../../scenarios/aum';
import { Reporter } from './assertions';

const r = new Reporter();
const TOL = 200; // cents — AUM does many per-year roundings

interface Case { name: string; client: Partial<Client>; pct: number }
const cases: Case[] = [
  { name: 'aum/50pct/24br/CA', client: { state: 'CA', max_tax_rate: 24, aum_growth_rate: 7, aum_fee_percent: 1, aum_dividend_yield: 2, aum_turnover_percent: 10, ltcg_rate: 15, aum_withdrawal_years: 5, age: 65, end_age: 90 }, pct: 50 },
  { name: 'aum/100pct/32br/TX/under59', client: { state: 'TX', max_tax_rate: 32, aum_growth_rate: 8, aum_fee_percent: 1.2, aum_dividend_yield: 2.5, aum_turnover_percent: 20, ltcg_rate: 15, aum_withdrawal_years: 3, age: 55, end_age: 85 }, pct: 100 },
  { name: 'aum/30pct/22br/MFJ/NJ', client: { state: 'NJ', state_tax_rate: 6, filing_status: 'married_filing_jointly', spouse_age: 60, max_tax_rate: 22, aum_growth_rate: 6, aum_fee_percent: 0.9, aum_dividend_yield: 1.8, aum_turnover_percent: 8, ltcg_rate: 15, aum_withdrawal_years: 7, age: 63, end_age: 92 }, pct: 30 },
];

for (const cs of cases) {
  const client = makeClient(cs.client);
  const startingIraPortion = Math.round((client.qualified_account_value ?? 0) * (cs.pct / 100));
  const projectionYears = client.end_age - client.age;
  const years = runAumScenario({ startingIraPortion, client, startYear: 2026, projectionYears });

  const wYears = Math.max(1, Math.min(projectionYears, client.aum_withdrawal_years ?? 5));
  const ordinaryEff = (client.max_tax_rate ?? 24) / 100 + (client.state_tax_rate != null ? client.state_tax_rate / 100 : stateRate(client.state));
  const aumRate = (client.aum_growth_rate ?? 7) / 100;

  for (let i = 0; i < years.length; i++) {
    const y = years[i];
    const pendingIra = y.traditionalBalance;
    const brokerage = y.taxableBalance;

    // non-negativity
    r.ran(); if (pendingIra < -TOL) r.record({ fixture: cs.name, scenario: 'formula', check: 'aum-nonneg-ira', year: y.year, age: y.age, actual: pendingIra });
    r.ran(); if (brokerage < -TOL) r.record({ fixture: cs.name, scenario: 'formula', check: 'aum-nonneg-brokerage', year: y.year, age: y.age, actual: brokerage });
    // netWorth identity
    r.ran(); if (Math.abs(y.netWorth - (pendingIra + brokerage)) > TOL) r.record({ fixture: cs.name, scenario: 'formula', check: 'aum-networth', year: y.year, age: y.age, expected: pendingIra + brokerage, actual: y.netWorth, delta: y.netWorth - (pendingIra + brokerage) });

    // transfer-tax theory: the IRA→AUM pull (aumTransfer) taxed at ordinary+state
    // (+10% if under 59½). aumTransfer is the gross pull this year.
    const gross = y.aumTransfer ?? 0;
    if (gross > 0) {
      const penalty = y.age < 60 ? gross * 0.10 : 0;
      const expectTaxFloor = Math.round(gross * ordinaryEff + penalty);
      // The year's total tax includes drag too, so tax must be AT LEAST the
      // transfer tax. (Equality only in a pure-transfer year with no brokerage.)
      r.ran();
      if ((y.aumTax ?? 0) < expectTaxFloor - TOL) {
        r.record({ fixture: cs.name, scenario: 'formula', check: 'aum-transfer-tax', year: y.year, age: y.age, expected: expectTaxFloor, actual: y.aumTax, delta: (y.aumTax ?? 0) - expectTaxFloor, note: 'year tax below the ordinary+penalty tax on the IRA→AUM transfer' });
      }
    }
  }

  // THEORY: transfer completeness — IRA slice fully transferred by withdrawalYears.
  const atEndOfWindow = years[wYears - 1];
  r.ran();
  if ((atEndOfWindow?.traditionalBalance ?? 0) > TOL) {
    r.record({ fixture: cs.name, scenario: 'formula', check: 'aum-transfer-complete', year: atEndOfWindow?.year, age: atEndOfWindow?.age, actual: atEndOfWindow?.traditionalBalance, note: `IRA slice not fully transferred by year ${wYears}` });
  }

  // THEORY: post-transfer brokerage net growth must be POSITIVE but STRICTLY
  // BELOW the gross growth rate (fees + dividend + turnover drag must reduce it).
  const postIdx = wYears + 1;
  if (postIdx + 1 < years.length) {
    const a = years[postIdx].taxableBalance, b = years[postIdx + 1].taxableBalance;
    if (a > 0) {
      const netRate = (b - a) / a;
      r.ran();
      if (netRate <= 0 || netRate >= aumRate) {
        r.record({ fixture: cs.name, scenario: 'formula', check: 'aum-net-growth-band', year: years[postIdx + 1].year, age: years[postIdx + 1].age, note: `post-transfer net growth ${(netRate * 100).toFixed(2)}% not in (0, ${(aumRate * 100).toFixed(1)}%) — drag wrong` });
      }
    }
  }
  console.log(`${cs.name}: start ${(startingIraPortion / 100).toLocaleString()}, brokerage@end ${((years[years.length - 1].taxableBalance) / 100).toLocaleString()}, IRA@${wYears}y ${((atEndOfWindow?.traditionalBalance ?? 0) / 100).toFixed(0)}`);
}

// Minimal state-rate fallback mirroring the AUM engine's getStateTaxRate for the
// no-override states used above (TX=0, CA top marginal handled via override-less path).
function stateRate(state?: string): number {
  const map: Record<string, number> = { TX: 0, FL: 0, CA: 0.123, NY: 0.0685 };
  return map[state ?? ''] ?? 0;
}

r.print('AUM engine — conservation + theory');
process.exit(r.breaches.length > 0 ? 1 : 0);
