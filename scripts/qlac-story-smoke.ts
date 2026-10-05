import { makeClient } from '../lib/calculations/__tests__/audit/factory';
import { runGrowthSimulation, createSimulationInput } from '../lib/calculations';
import { applyQlacToClient, applyQlacOverlay } from '../lib/calculations/utils/qlac';
import { generateStory } from '../lib/calculations/story-generator';
import type { Client } from '../lib/types/client';
import type { Projection } from '../lib/types/projection';

const ali: Client = makeClient({
  name: 'ali', blueprint_type: 'vesting-bonus-growth', filing_status: 'single', state: 'VA', state_tax_rate: 5.75,
  age: 63, end_age: 90, qualified_account_value: 170_000_000, bonus_percent: 14, rate_of_return: 6, baseline_comparison_rate: 6,
  tax_rate: 32, max_tax_rate: 32, conversion_type: process.argv[2] === 'noconv' ? 'no_conversion' : 'optimized_amount', tax_payment_source: 'from_ira',
  ssi_payout_age: 70, ssi_annual_amount: 3_600_000, rmd_treatment: 'reinvested', heir_tax_rate: 40,
  qlac_premium: 21_000_000, qlac_income_start_age: 85, qlac_annual_income: 6_000_000, qlac_death_benefit: 'return_of_premium',
});
const baseline = runGrowthSimulation(createSimulationInput(ali)).baseline;
const formula = runGrowthSimulation(createSimulationInput(applyQlacToClient(ali))).formula;
applyQlacOverlay(ali, formula);
const lb = baseline[baseline.length - 1], lf = formula[formula.length - 1];
const projection = {
  baseline_years: baseline, blueprint_years: formula, aum_years: null, aum_final_balance: null,
  baseline_final_traditional: lb.traditionalBalance, baseline_final_roth: lb.rothBalance, baseline_final_taxable: lb.taxableBalance, baseline_final_net_worth: lb.netWorth,
  blueprint_final_traditional: lf.traditionalBalance, blueprint_final_roth: lf.rothBalance, blueprint_final_taxable: lf.taxableBalance, blueprint_final_net_worth: lf.netWorth,
  blueprint_final_qlac_death_benefit: lf.qlacDeathBenefit ?? 0,
} as unknown as Projection;
for (const e of generateStory(ali, projection)) {
  if (!/qlac|rmd_age|strategy_setup|death_legacy/.test(e.trigger)) continue;
  console.log(`\n[${e.year} · ${e.age}] ${e.trigger} — ${e.headline}\n  ${e.body}`);
  if (e.details) for (const d of e.details) console.log(`  · ${d.label}: ${d.value}`);
  if (e.metrics) console.log('  metrics:', e.metrics.map(m => `${m.label}=${m.value}`).join(' | '));
  if (e.comparison) console.log('  ↔', e.comparison);
}
