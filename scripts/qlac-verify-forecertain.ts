/**
 * Verify the QLAC overlay against Global Atlantic ForeCertain quotes for
 * Mazhar Ahson (born 12/31/1962, VA, $210K QLAC, Single Life w/ Cash Refund):
 *   D77W1D — income from 01/01/2038 (age 75): $2,768.84/mo = $33,226.08/yr
 *   D77W5H — income from 01/01/2043 (age 80): $5,304.64/mo = $63,655.68/yr
 * Cost basis $0 → fully taxable; level payments; min payout $210K.
 */
import { makeClient } from '../lib/calculations/__tests__/audit/factory';
import { runGrowthSimulation, createSimulationInput } from '../lib/calculations';
import { resolveQlacSides, applyQlacToResult } from '../lib/calculations/utils/qlac';

const QUOTES = [
  { id: 'D77W1D', startAge: 75, monthly: 276884, firstYear: 2038, schedule: [3322608, 6645216, 9967824, 13290432, 16613040, 19935648, 23258256, 26580864, 29903472, 33226080, 36548688] },
  { id: 'D77W5H', startAge: 80, monthly: 530464, firstYear: 2043, schedule: [6365568, 12731136, 19096704, 25462272, 31827840, 38193408, 44558976, 50924544, 57290112, 63655680, 70021248] },
];
let fails = 0;
for (const q of QUOTES) {
  const annual = q.monthly * 12;
  const client = makeClient({
    name: 'Mazhar Ahson', filing_status: 'single', state: 'VA', state_tax_rate: 5.75, date_of_birth: '1962-12-31',
    age: 63, end_age: 100, qualified_account_value: 170_000_000, blueprint_type: 'vesting-bonus-growth', bonus_percent: 0, rate_of_return: 5, growth_rate: 5, baseline_comparison_rate: 5,
    conversion_type: 'no_conversion', rmd_treatment: 'reinvested',
    qlac_premium: 21_000_000, qlac_income_start_age: q.startAge, qlac_annual_income: annual, qlac_death_benefit: 'return_of_premium',
  });
  const { strategyClient, baselineClient } = resolveQlacSides(client);
  const result = { ...runGrowthSimulation(createSimulationInput(strategyClient)), baseline: runGrowthSimulation(createSimulationInput(baselineClient)).baseline };
  applyQlacToResult(client, result);
  console.log(`\n=== ${q.id}: income from age ${q.startAge} ($${(annual/100).toLocaleString()}/yr) ===`);
  let cum = 0; const rows = result.formula;
  const preStart = rows.filter(y => y.age < q.startAge);
  const badPre = preStart.filter(y => (y.qlacPayout ?? 0) !== 0 || y.qlacDeathBenefit !== 21_000_000);
  console.log(`before ${q.startAge}: payout 0 & death benefit $210,000 every year — ${badPre.length === 0 ? 'OK' : 'FAIL'}`); fails += badPre.length;
  const firstRow = rows.find(y => y.age === q.startAge)!;
  console.log(`first payout year ${firstRow.year} (quote: ${q.firstYear}) — ${firstRow.year === q.firstYear ? 'OK' : 'FAIL'}`); if (firstRow.year !== q.firstYear) fails++;
  for (let i = 0; i < q.schedule.length; i++) {
    const y = rows.find(r => r.age === q.startAge + i)!;
    cum += y.qlacPayout ?? 0;
    const expectDB = Math.max(0, 21_000_000 - q.schedule[i]);
    const ok = cum === q.schedule[i] && y.qlacDeathBenefit === expectDB && (y.otherIncome ?? 0) >= annual;
    if (!ok) fails++;
    console.log(`  age ${y.age}: payout $${(y.qlacPayout!/100).toFixed(2)}  cumulative $${(cum/100).toLocaleString()} (quote $${(q.schedule[i]/100).toLocaleString()})  refund left $${(y.qlacDeathBenefit!/100).toLocaleString()}  in taxable income: ${(y.otherIncome ?? 0) >= annual ? 'yes' : 'NO'}  ${ok ? '✓' : '✗'}`);
  }
  const last = rows[rows.length - 1];
  console.log(`  age ${last.age}: cumulative $${(rows.reduce((s, y) => s + (y.qlacPayout ?? 0), 0)/100).toLocaleString()} (quote at 100: $${(q.schedule[q.schedule.length-1]/100).toLocaleString()} at ${q.startAge + q.schedule.length - 1})`);
  // RMD base check: first RMD year, strategy RMD = baseline RMD × (IRA − 210K)/IRA (no bonus, no conversion)
  const rmdYear = rows.find(y => (y.rmdAmount ?? 0) > 0)!; const base = result.baseline.find(y => y.year === rmdYear.year)!;
  const expected = Math.round(base.rmdAmount * (170_000_000 - 21_000_000) / 170_000_000);
  console.log(`  first RMD (age ${rmdYear.age}): strategy $${(rmdYear.rmdAmount/100).toLocaleString()} vs full-IRA $${(base.rmdAmount/100).toLocaleString()} — expected $${(expected/100).toLocaleString()} ${Math.abs(rmdYear.rmdAmount - expected) <= 1 ? '✓' : '✗'}`);
  if (Math.abs(rmdYear.rmdAmount - expected) > 1) fails++;
}
console.log(fails === 0 ? '\nALL MATCH' : `\n${fails} MISMATCHES`);
