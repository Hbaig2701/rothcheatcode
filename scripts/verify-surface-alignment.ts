/**
 * Do the report surfaces AGREE?
 *
 * The advisory fee and the managed-Roth destination are each read independently
 * by four places — the results dashboard, the year-by-year table, the story
 * (which also feeds the story PDF), and the main PDF. Each derives its own
 * numbers from the client + projection, so they can silently drift apart. This
 * recomputes each surface's figures the same way the surface does and demands
 * they match.
 *
 * Usage: npx tsx scripts/verify-surface-alignment.ts
 */
import { runGrowthSimulation, createSimulationInput } from '../lib/calculations';
import { generateStory } from '../lib/calculations/story-generator';
import type { Client } from '../lib/types/client';
import type { Projection } from '../lib/types/projection';

const D = (c: number) => `$${Math.round(c / 100).toLocaleString()}`;
let fails = 0;
const ck = (l: string, ok: boolean, d = '') => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); };

const BASE = {
  age: 65, spouse_age: 63, end_age: 95, filing_status: 'married_filing_jointly', state: 'FL',
  blueprint_type: 'none', qualified_account_value: 200_000_000, taxable_accounts: 25_000_000,
  roth_ira: 0, rate_of_return: 6, baseline_comparison_rate: 6, post_contract_rate: 6,
  max_tax_rate: 24, tax_payment_source: 'from_ira', rmd_treatment: 'reinvested',
  ssi_annual_amount: 4_000_000, spouse_ssi_annual_amount: 2_400_000, ssi_payout_age: 67,
  spouse_ssi_payout_age: 67, non_ssi_income: [], heir_tax_rate: 40, ltcg_rate: 15,
  conversion_type: 'optimized_amount', aum_allocation_percent: 0, aum_fee_percent: 1,
} as unknown as Client;

function build(over: Partial<Client>) {
  const client = { ...BASE, ...over } as Client;
  const res = runGrowthSimulation(createSimulationInput(client, null));
  const projection = {
    blueprint_years: res.formula, baseline_years: res.baseline,
    aum_years: null, aum_final_balance: 0,
    blueprint_final_net_worth: res.formula.at(-1)!.netWorth,
    baseline_final_net_worth: res.baseline.at(-1)!.netWorth,
    baseline_final_traditional: res.baseline.at(-1)!.traditionalBalance,
    break_even_age: null,
  } as unknown as Projection;
  return { client, res, projection };
}

const CASES: Array<[string, Partial<Client>]> = [
  ['fee only (1%, both sides)', { advisory_fee_percent: 1 }],
  ['fee strategy-only', { advisory_fee_percent: 1, advisory_fee_in_baseline: false }],
  ['managed Roth 40% @ 6%', { aum_allocation_percent: 40, aum_destination: 'roth' }],
  ['managed Roth 40% @ 9% + 1% fee', { aum_allocation_percent: 40, aum_destination: 'roth', aum_growth_rate: 9, advisory_fee_percent: 1 }],
  ['managed Roth 100% + 1% fee', { aum_allocation_percent: 100, aum_destination: 'roth', advisory_fee_percent: 1 }],
];

for (const [name, over] of CASES) {
  console.log(`\n=== ${name} ===`);
  const { client, res, projection } = build(over);

  // --- the single source of truth each surface should land on ---
  const truth = {
    feeStrategy: res.formula.reduce((t, y) => t + (y.advisoryFee ?? 0), 0),
    feeBaseline: res.baseline.reduce((t, y) => t + (y.advisoryFee ?? 0), 0),
    feePct: client.advisory_fee_percent ?? 0,
    feeBothSides: (client.advisory_fee_in_baseline ?? true) === true,
    managedPct: client.aum_destination === 'roth' ? (client.aum_allocation_percent ?? 0) : 0,
    managedRate: client.aum_growth_rate ?? client.rate_of_return ?? 7,
    managedFinal: res.formula.at(-1)!.rothManagedBalance ?? 0,
    baselineRate: client.baseline_comparison_rate ?? client.growth_rate ?? 7,
  };

  // --- DASHBOARD (growth-report-dashboard.tsx) ---
  const dash = {
    feeStrategy: (client.advisory_fee_percent ?? 0) > 0 ? res.formula.reduce((t, y) => t + (y.advisoryFee ?? 0), 0) : 0,
    feeBaseline: (client.advisory_fee_percent ?? 0) > 0 ? res.baseline.reduce((t, y) => t + (y.advisoryFee ?? 0), 0) : 0,
    managedPct: client.aum_destination === 'roth' ? (client.aum_allocation_percent ?? 0) : 0,
    managedFinal: res.formula.at(-1)!.rothManagedBalance ?? 0,
    rateDiffers: (client.aum_destination === 'roth' && (client.aum_allocation_percent ?? 0) > 0)
      && Math.abs(truth.managedRate - truth.baselineRate) > 0.01,
  };
  ck('dashboard fee totals match the engine', dash.feeStrategy === truth.feeStrategy && dash.feeBaseline === truth.feeBaseline,
    `${D(dash.feeStrategy)} / ${D(dash.feeBaseline)}`);
  ck('dashboard managed figures match the engine',
    dash.managedPct === truth.managedPct && dash.managedFinal === truth.managedFinal,
    `${dash.managedPct}% · ${D(dash.managedFinal)}`);

  // --- PDF (generate-pdf/route.ts prepareTemplateData) ---
  const pdf = {
    hasAdvisoryFee: (client.advisory_fee_percent ?? 0) > 0,
    advisoryFeeInBaseline: (client.advisory_fee_in_baseline ?? true) === true,
    feeStrategy: (projection.blueprint_years ?? []).reduce((t, y) => t + (y.advisoryFee ?? 0), 0),
    feeBaseline: (projection.baseline_years ?? []).reduce((t, y) => t + (y.advisoryFee ?? 0), 0),
    hasManagedRoth: client.aum_destination === 'roth' && (client.aum_allocation_percent ?? 0) > 0,
    managedPct: client.aum_allocation_percent ?? 0,
    managedFinal: (projection.blueprint_years ?? []).at(-1)?.rothManagedBalance ?? 0,
    growthDiffers: (client.aum_allocation_percent ?? 0) > 0 && client.aum_growth_rate != null
      && Math.abs(client.aum_growth_rate - truth.baselineRate) > 0.01,
  };
  ck('PDF fee totals match the dashboard', pdf.feeStrategy === dash.feeStrategy && pdf.feeBaseline === dash.feeBaseline,
    `${D(pdf.feeStrategy)} / ${D(pdf.feeBaseline)}`);
  ck('PDF discloses the fee exactly when it is charged', pdf.hasAdvisoryFee === (truth.feePct > 0));
  ck('PDF baseline-side wording matches the engine', pdf.advisoryFeeInBaseline === truth.feeBothSides
    && (truth.feeBothSides ? truth.feeBaseline > 0 || truth.feePct === 0 : truth.feeBaseline === 0),
    `bothSides=${pdf.advisoryFeeInBaseline}, baseline charged ${D(truth.feeBaseline)}`);
  ck('PDF managed figures match the dashboard',
    pdf.hasManagedRoth === (dash.managedPct > 0) && pdf.managedFinal === dash.managedFinal);
  ck('PDF and dashboard agree on the return-asymmetry warning', pdf.growthDiffers === dash.rateDiffers,
    `pdf=${pdf.growthDiffers} dashboard=${dash.rateDiffers}`);

  // --- STORY (feeds story mode AND the story PDF) ---
  const story = generateStory(client, projection);
  const setup = story.find((e) => e.trigger === 'strategy_setup');
  const rows = (setup?.details ?? []).map((d) => `${d.label}: ${d.value}`);
  const chips = (setup?.metrics ?? []).map((m) => `${m.label}: ${m.value}`);
  const feeRow = rows.find((t) => t.startsWith('Advisory fee:'));
  const mgdRow = rows.find((t) => t.startsWith('Managed allocation:'));
  const noteRow = rows.find((t) => t.startsWith('Note on returns:'));

  ck('story discloses the fee exactly when it is charged', !!feeRow === (truth.feePct > 0), feeRow ?? '(absent)');
  if (feeRow) {
    ck('story quotes the same fee total as the dashboard', feeRow.includes(D(truth.feeStrategy)),
      `expected ${D(truth.feeStrategy)}`);
    ck('story names the right side', truth.feeBothSides ? feeRow.includes('BOTH') : feeRow.includes('only'));
    ck('story fee chip present', chips.some((c) => c === `Advisory Fee: ${truth.feePct}%/yr`), chips.join(' | '));
  }
  ck('story mentions the managed allocation exactly when active', !!mgdRow === (truth.managedPct > 0), mgdRow ?? '(absent)');
  if (mgdRow) {
    ck('story quotes the same managed % and rate',
      mgdRow.includes(`${truth.managedPct}%`) && mgdRow.includes(`${truth.managedRate}%/yr`));
    ck('story says the money is converted either way',
      rows.some((t) => t.startsWith('Destination:') && t.includes('converted either way')));
  }
  ck('story warns about differing returns exactly when the dashboard does',
    !!noteRow === dash.rateDiffers, noteRow ? 'warned' : '(no warning)');
}

console.log(`\n${fails === 0 ? 'ALL SURFACES ALIGN' : `${fails} MISALIGNMENT(S)`}\n`);
process.exit(fails === 0 ? 0 : 1);
