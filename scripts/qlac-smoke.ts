/**
 * QLAC smoke test on Mazhar's "Ali" profile (single, VA, age 63, $1.7M IRA,
 * 32% bracket, SS $36K at 70, $64K pension 63-67). Runs the same
 * transform → engine → overlay pipeline the projections route uses and prints
 * the strategy-only QLAC vs no-QLAC deltas year by year.
 *
 *   npx tsx scripts/qlac-smoke.ts
 */
import { makeClient } from '../lib/calculations/__tests__/audit/factory';
import { runGrowthSimulation, createSimulationInput } from '../lib/calculations';
import { applyQlacToClient, applyQlacOverlay, computeQlacPayoutSchedule } from '../lib/calculations/utils/qlac';
import type { Client } from '../lib/types/client';

const fmt = (c: number) => '$' + Math.round(c / 100).toLocaleString();

const ali: Client = makeClient({
  name: 'ali',
  blueprint_type: 'vesting-bonus-growth',
  filing_status: 'single',
  state: 'VA',
  state_tax_rate: 5.75,
  age: 63,
  end_age: 90,
  qualified_account_value: 170_000_000,
  bonus_percent: 14,
  rate_of_return: 6,
  baseline_comparison_rate: 6,
  tax_rate: 32,
  max_tax_rate: 32,
  conversion_type: 'optimized_amount',
  tax_payment_source: 'from_ira',
  ssi_payout_age: 70,
  ssi_annual_amount: 3_600_000,
  non_ssi_income: [63, 64, 65, 66, 67].map((age, i) => ({ year: 2026 + i, age, gross_taxable: 6_400_000, tax_exempt: 0, type: 'pension' as const })),
  rmd_treatment: 'reinvested',
  heir_tax_rate: 40,
});

function run(client: Client, label: string) {
  const strategyClient = applyQlacToClient(client);
  const baseline = runGrowthSimulation(createSimulationInput(client)).baseline; // do-nothing on the FULL IRA
  const strategy = runGrowthSimulation(createSimulationInput(strategyClient)).formula;
  applyQlacOverlay(client, strategy);
  const last = strategy[strategy.length - 1];
  const lastB = baseline[baseline.length - 1];
  const heir = (client.heir_tax_rate ?? 40) / 100;
  const baseLegacy = lastB.netWorth - Math.round(lastB.traditionalBalance * heir);
  const stratLegacy = last.netWorth - Math.round((last.traditionalBalance + (last.qlacDeathBenefit ?? 0)) * heir);
  console.log(`\n=== ${label} ===`);
  console.log(`starting IRA for strategy: ${fmt(strategyClient.qualified_account_value)}  (payout yrs: ${computeQlacPayoutSchedule(client).size})`);
  console.log(`baseline net legacy ${fmt(baseLegacy)} | strategy net legacy ${fmt(stratLegacy)} | delta ${fmt(stratLegacy - baseLegacy)}`);
  console.log(`strategy lifetime tax ${fmt(strategy.reduce((s, y) => s + y.totalTax, 0))} | IRMAA ${fmt(strategy.reduce((s, y) => s + y.irmaaSurcharge, 0))} | conversions ${fmt(strategy.reduce((s, y) => s + y.conversionAmount, 0))}`);
  console.log('age  conv      rmd       other     qlacPay   magi      tier fed+st    irmaa   trad      roth      taxable   qlacDB   netWorth');
  for (const y of strategy) {
    if (![63, 64, 68, 70, 75, 76, 80, 84, 85, 86, 89, 90].includes(y.age)) continue;
    console.log(
      String(y.age).padEnd(4),
      fmt(y.conversionAmount).padEnd(9), fmt(y.rmdAmount).padEnd(9), fmt(y.otherIncome).padEnd(9),
      fmt(y.qlacPayout ?? 0).padEnd(9), fmt(y.magi ?? 0).padEnd(9), String(y.irmaaTier ?? '-').padEnd(4),
      fmt(y.federalTax + y.stateTax).padEnd(9), fmt(y.irmaaSurcharge).padEnd(7),
      fmt(y.traditionalBalance).padEnd(9), fmt(y.rothBalance).padEnd(9), fmt(y.taxableBalance).padEnd(9),
      fmt(y.qlacDeathBenefit ?? 0).padEnd(8), fmt(y.netWorth),
    );
  }
  // invariant
  for (const y of strategy) {
    const sum = y.traditionalBalance + y.rothBalance + y.taxableBalance + (y.qlacDeathBenefit ?? 0);
    if (Math.abs(sum - y.netWorth) > 1) { console.log('NETWORTH INVARIANT BROKEN', y.age, sum, y.netWorth); break; }
  }
  return { baseline, strategy };
}

run(ali, 'No QLAC');
run({ ...ali, qlac_premium: 21_000_000, qlac_income_start_age: 85, qlac_annual_income: 6_000_000, qlac_death_benefit: 'return_of_premium' }, 'QLAC $210K, income $60K/yr from 85, ROP');
run({ ...ali, qlac_premium: 21_000_000, qlac_income_start_age: 80, qlac_annual_income: 4_000_000, qlac_death_benefit: 'none' }, 'QLAC $210K, income $40K/yr from 80, life-only');

// RMD-reduction check: no conversions at all, so the strategy's only difference is the QLAC.
{
  const noConv: Client = { ...ali, conversion_type: 'no_conversion', bonus_percent: 0, blueprint_type: 'none' as Client['blueprint_type'] };
  const q = { ...noConv, qlac_premium: 21_000_000, qlac_income_start_age: 85, qlac_annual_income: 6_000_000 } as Client;
  const { baseline, strategy } = run(q, 'NO CONVERSION + QLAC (RMD isolation)');
  console.log('\nage  baseRMD    stratRMD   baseMAGI   stratMAGI  baseTier stratTier baseIRMAA stratIRMAA');
  for (let i = 0; i < strategy.length; i++) {
    const b = baseline[i], s = strategy[i];
    if (s.age < 74 || s.age > 90) continue;
    console.log(String(s.age).padEnd(4), fmt(b.rmdAmount).padEnd(10), fmt(s.rmdAmount).padEnd(10), fmt(b.magi ?? 0).padEnd(10), fmt(s.magi ?? 0).padEnd(10), String(b.irmaaTier).padEnd(8), String(s.irmaaTier).padEnd(9), fmt(b.irmaaSurcharge).padEnd(9), fmt(s.irmaaSurcharge));
  }
}
