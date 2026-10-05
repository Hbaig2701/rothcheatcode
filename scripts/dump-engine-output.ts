/**
 * Dump raw engine output for a deterministic fixture matrix to JSON, so the
 * same script can be run on two git revisions and the results diffed. Used to
 * prove an additive engine change moves NOTHING for existing clients.
 *
 * Usage: npx tsx scripts/dump-engine-output.ts <outfile>
 */
import { writeFileSync } from 'fs';
import { runGrowthSimulation, runSimulation, runGuaranteedIncomeSimulation, createSimulationInput, runAumScenario } from '../lib/calculations';
import type { Client } from '../lib/types/client';

const BASE = {
  age: 65, spouse_age: 63, end_age: 95, filing_status: 'married_filing_jointly', state: 'CA',
  qualified_account_value: 150_000_000, taxable_accounts: 20_000_000, roth_ira: 5_000_000,
  rate_of_return: 6, baseline_comparison_rate: 6, post_contract_rate: 5, max_tax_rate: 24,
  bonus_percent: 10, surrender_years: 10, surrender_schedule: [9,9,8,7,6,5,4,3,2,1],
  penalty_free_percent: 10, tax_payment_source: 'from_ira', rmd_treatment: 'reinvested',
  withdrawal_type: 'no_withdrawals', ssi_annual_amount: 3_600_000, spouse_ssi_annual_amount: 2_400_000,
  ssi_payout_age: 67, spouse_ssi_payout_age: 67, non_ssi_income: [], heir_tax_rate: 40,
  aum_allocation_percent: 0, projection_years: 30, ltcg_rate: 15,
} as unknown as Client;

const out: Record<string, unknown> = {};
let n = 0;
for (const bp of ['none', 'fia', 'phased-bonus-growth', 'high-bonus-long-term-growth', 'compound-rollup-income'] as const) {
  for (const ct of ['optimized_amount', 'fixed_amount', 'partial_amount', 'full_conversion', 'no_conversion'] as const) {
    for (const fs of ['single', 'married_filing_jointly'] as const) {
      for (const rmd of ['reinvested', 'spent', 'cash'] as const) {
        for (const aum of [0, 25, 100]) {
          const c = { ...BASE, blueprint_type: bp, conversion_type: ct, filing_status: fs,
            rmd_treatment: rmd, aum_allocation_percent: aum,
            fixed_conversion_amount: 8_000_000, target_partial_amount: 50_000_000,
            income_start_age: 70, guaranteed_rate_of_return: 7, payout_type: 'individual',
          } as unknown as Client;
          const input = createSimulationInput(c, null);
          const isGI = bp.includes('income');
          const isGrowth = !isGI;
          const res = isGI ? runGuaranteedIncomeSimulation(input)
            : isGrowth ? runGrowthSimulation(input) : runSimulation(input);
          out[`${bp}|${ct}|${fs}|${rmd}|aum${aum}`] = { formula: res.formula, baseline: res.baseline };
          n++;
          // Exercise the AUM bucket too — aum_allocation_percent is applied by
          // the ROUTE, not the engine, so the rows above never see the split.
          if (aum > 0) {
            const rothSide = { ...c, qualified_account_value: Math.round((c.qualified_account_value ?? 0) * (1 - aum / 100)) } as Client;
            const rothRes = isGI ? runGuaranteedIncomeSimulation(createSimulationInput(rothSide, null))
                                 : runGrowthSimulation(createSimulationInput(rothSide, null));
            const aumRows = runAumScenario({
              startingIraPortion: Math.round((c.qualified_account_value ?? 0) * (aum / 100)),
              client: c, startYear: rothRes.formula[0].year, projectionYears: rothRes.formula.length,
            });
            out[`${bp}|${ct}|${fs}|${rmd}|aum${aum}|AUMBUCKET`] = { formula: aumRows, baseline: rothRes.formula };
            n++;
          }
        }
      }
    }
  }
}
// Also exercise the legacy standard engine (no blueprint_type).
for (const ct of ['optimized_amount', 'no_conversion'] as const) {
  const c = { ...BASE, blueprint_type: undefined, conversion_type: ct } as unknown as Client;
  const res = runSimulation(createSimulationInput(c, null));
  out[`legacy|${ct}`] = { formula: res.formula, baseline: res.baseline };
  n++;
}

writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log(`wrote ${n} scenarios to ${process.argv[2]}`);
