import { runGrowthSimulation, createSimulationInput, runAumScenario } from '../lib/calculations';
import { withAumPullMagi } from '../lib/calculations/utils/aum-magi';
import { aumSliceGoesToTaxableBrokerage } from '../lib/calculations/utils/aum-destination';
import type { Client } from '../lib/types/client';
const D = (c: number) => `$${Math.round(c / 100).toLocaleString()}`;
let fails = 0;
const ck = (l: string, ok: boolean, d = '') => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); };

const B = {
  age: 65, spouse_age: 63, end_age: 95, filing_status: 'married_filing_jointly', state: 'FL',
  blueprint_type: 'none', qualified_account_value: 200_000_000, taxable_accounts: 25_000_000,
  roth_ira: 0, rate_of_return: 6, baseline_comparison_rate: 6, post_contract_rate: 6,
  max_tax_rate: 24, tax_payment_source: 'from_ira', rmd_treatment: 'reinvested',
  withdrawal_type: 'no_withdrawals', ssi_annual_amount: 4_000_000,
  spouse_ssi_annual_amount: 2_400_000, ssi_payout_age: 67, spouse_ssi_payout_age: 67,
  non_ssi_income: [], heir_tax_rate: 40, ltcg_rate: 15, aum_fee_percent: 1,
  aum_dividend_yield: 2, aum_turnover_percent: 10, aum_withdrawal_years: 5,
  conversion_type: 'optimized_amount', advisory_fee_percent: 1,
} as unknown as Client;
const mk = (o: Partial<Client>) => ({ ...B, ...o }) as Client;
const H = 0.40;
const leg = (rows: any[]) => { const y = rows[rows.length-1]; return Math.round(y.traditionalBalance*(1-H)) + y.rothBalance + (y.taxableBalance||0); };

// Route replica, now destination-aware.
function route(c: Client) {
  const rothSide = withAumPullMagi(aumSliceGoesToTaxableBrokerage(c)
    ? { ...c, qualified_account_value: Math.round((c.qualified_account_value ?? 0) * (1 - (c.aum_allocation_percent ?? 0)/100)) } as Client
    : c, c);
  const strat = runGrowthSimulation(createSimulationInput(rothSide, null));
  const needsOwn = aumSliceGoesToTaxableBrokerage(c);
  const baseline = needsOwn ? runGrowthSimulation(createSimulationInput(c, null)).baseline : strat.baseline;
  let formula = strat.formula as any[];
  if (aumSliceGoesToTaxableBrokerage(c)) {
    const a = runAumScenario({ startingIraPortion: Math.round((c.qualified_account_value ?? 0) * ((c.aum_allocation_percent ?? 0)/100)),
      client: c, startYear: strat.formula[0].year, projectionYears: strat.formula.length });
    formula = strat.formula.map((r, i) => ({ ...r,
      traditionalBalance: r.traditionalBalance + a[i].traditionalBalance,
      rothBalance: r.rothBalance + a[i].rothBalance,
      taxableBalance: r.taxableBalance + a[i].taxableBalance,
      advisoryFee: (r.advisoryFee ?? 0) + (a[i].advisoryFee ?? 0) }));
  }
  return { formula, baseline };
}

console.log('\n=== The three strategies, same $2M client, 1% fee both sides ===');
const noAum   = route(mk({ aum_allocation_percent: 0 }));
const taxable = route(mk({ aum_allocation_percent: 100, aum_destination: 'taxable' }));
const rothDst = route(mk({ aum_allocation_percent: 100, aum_destination: 'roth' }));
console.log(`Do nothing                          ${D(leg(noAum.baseline))}`);
console.log(`Convert, AUM off                    ${D(leg(noAum.formula))}`);
console.log(`AUM 100% -> taxable brokerage       ${D(leg(taxable.formula))}`);
console.log(`AUM 100% -> ROTH (managed)          ${D(leg(rothDst.formula))}`);

ck('Roth destination CONVERTS (taxable one does not)',
  (rothDst.formula[0] as any).conversionAmount > 0 && (taxable.formula[0] as any).conversionAmount === 0,
  `roth yr1 ${D((rothDst.formula[0] as any).conversionAmount)} vs taxable ${D((taxable.formula[0] as any).conversionAmount)}`);
ck('Roth destination beats the taxable brokerage', leg(rothDst.formula) > leg(taxable.formula),
  `by ${D(leg(rothDst.formula) - leg(taxable.formula))}`);
ck('Roth destination ends with a ROTH balance, not a brokerage',
  (rothDst.formula[rothDst.formula.length-1] as any).rothBalance > 0
  && (taxable.formula[taxable.formula.length-1] as any).taxableBalance > (rothDst.formula[rothDst.formula.length-1] as any).taxableBalance);
ck('at 100% managed with the same growth rate, Roth dest == AUM-off',
  leg(rothDst.formula) === leg(noAum.formula),
  `${D(leg(rothDst.formula))} vs ${D(leg(noAum.formula))} — identical as expected (same rate)`);

console.log('\n=== The managed sleeve tracks, and a different growth rate bites ===');
for (const g of [4, 6, 8]) {
  const r = route(mk({ aum_allocation_percent: 40, aum_destination: 'roth', aum_growth_rate: g }));
  const last = r.formula[r.formula.length-1] as any;
  const share = last.rothBalance > 0 ? last.rothManagedBalance / last.rothBalance : 0;
  ck(`managed growth ${g}%: sleeve is a subset of the Roth`,
    last.rothManagedBalance <= last.rothBalance + 1,
    `sleeve ${D(last.rothManagedBalance)} of ${D(last.rothBalance)} (${(share*100).toFixed(0)}%)  net legacy ${D(leg(r.formula))}`);
}
const g4 = leg(route(mk({ aum_allocation_percent: 40, aum_destination: 'roth', aum_growth_rate: 4 })).formula);
const g8 = leg(route(mk({ aum_allocation_percent: 40, aum_destination: 'roth', aum_growth_rate: 8 })).formula);
ck('a higher managed growth rate raises net legacy', g8 > g4, `4%: ${D(g4)} -> 8%: ${D(g8)}`);

console.log('\n=== Existing clients untouched ===');
const a = runGrowthSimulation(createSimulationInput(mk({ aum_allocation_percent: 40 }), null));
const b = runGrowthSimulation(createSimulationInput(mk({ aum_allocation_percent: 40, aum_destination: 'taxable' }), null));
ck('destination null == explicit taxable', JSON.stringify(a) === JSON.stringify(b));
const noDest = runGrowthSimulation(createSimulationInput(mk({ aum_allocation_percent: 0, advisory_fee_percent: 0 }), null));
ck('no managed sleeve when destination is off', noDest.formula.every((y: any) => (y.rothManagedBalance ?? 0) === 0));

console.log('\n=== GI products ignore the destination ===');
const gi = mk({ blueprint_type: 'compound-rollup-income', income_start_age: 70, guaranteed_rate_of_return: 7, payout_type: 'individual', aum_allocation_percent: 100 });
ck('GI treated as taxable split regardless of destination',
  aumSliceGoesToTaxableBrokerage({ ...gi, aum_destination: 'roth' } as Client) === true);

console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : `${fails} ISSUE(S)`}\n`);
process.exit(fails === 0 ? 0 : 1);
