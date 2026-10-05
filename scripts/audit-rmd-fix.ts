/**
 * Audit harness for the RMD-funds-conversion-tax fix (Kwanza Ellis ticket).
 *
 * Runs a matrix of growth-FIA scenarios and dumps the key money figures for the
 * first conversion year + final legacy. Designed to be run BEFORE and AFTER the
 * engine change (via git stash) so a diff proves:
 *   - from_taxable / pre-RMD-age / no-conversion cases are BYTE-IDENTICAL
 *   - from_ira + RMD + conversion cases drop the phantom extra tax pull
 *
 * All inputs in CENTS. Run: npx tsx scripts/audit-rmd-fix.ts
 */
import { runGrowthFormulaScenario } from '../lib/calculations/scenarios/growth-formula';
import { runFormulaScenario } from '../lib/calculations/scenarios/formula';

const d = (n?: number) => '$' + Math.round((n ?? 0) / 100).toLocaleString();

const ENGINE = process.env.ENGINE ?? 'growth';
function growth(c: any) {
  return ENGINE === 'formula'
    ? runFormulaScenario(c, 2026, (c.end_age - c.age))
    : runGrowthFormulaScenario(c, 2026, (c.end_age - c.age), null);
}

const base = {
  filing_status: 'single',
  state: 'TX', state_tax_rate: 0,
  roth_ira: 0, taxable_accounts: 0,
  ss_self: 0, ss_spouse: 0, ssi_payout_age: 70, ssi_annual_amount: 0,
  rmd_treatment: 'spent', non_ssi_income: [],
  growth_rate: 7, baseline_comparison_rate: 7, rate_of_return: 7,
  product_name: 'fia', carrier_name: 'Generic',
  bonus_percent: 0, anniversary_bonus_percent: 0,
  constraint_type: 'bracket_ceiling',
};

// The scenarios. Each gets run; we print the conversion-year row + final.
const scenarios: Record<string, any> = {
  // THE headline case: age 75, $738K IRA, $100K fixed conv, tax from IRA, no taxable.
  // Expect totalIRAWithdrawal to drop from ~$148.5K to ~$130K (RMD covers the tax).
  'A_synthetic_from_ira_RMD': {
    ...base, age: 75, end_age: 90, qualified_account_value: 73_800_000,
    conversion_type: 'fixed_amount', fixed_conversion_amount: 10_000_000,
    max_tax_rate: 24, tax_payment_source: 'from_ira',
  },
  // Same but tax paid externally — MUST be byte-identical pre/post (control).
  'B_synthetic_from_taxable_RMD': {
    ...base, age: 75, end_age: 90, qualified_account_value: 73_800_000, taxable_accounts: 50_000_000,
    conversion_type: 'fixed_amount', fixed_conversion_amount: 10_000_000,
    max_tax_rate: 24, tax_payment_source: 'external',
  },
  // Pre-RMD age (60), from_ira — no RMD, MUST be byte-identical pre/post (control).
  'C_preRMD_from_ira_noRMD': {
    ...base, age: 60, end_age: 80, qualified_account_value: 73_800_000,
    conversion_type: 'fixed_amount', fixed_conversion_amount: 10_000_000,
    max_tax_rate: 24, tax_payment_source: 'from_ira',
  },
  // Optimized (bracket-fill), from_ira, age 75 with RMD — planner path.
  'D_optimized_from_ira_RMD': {
    ...base, age: 75, end_age: 92, qualified_account_value: 73_800_000,
    conversion_type: 'optimized_amount', max_tax_rate: 24, tax_payment_source: 'from_ira',
  },
  // Reinvested mode, from_ira, RMD — checks taxable-flow conservation.
  'E_reinvested_from_ira_RMD': {
    ...base, age: 75, end_age: 92, qualified_account_value: 73_800_000, rmd_treatment: 'reinvested',
    conversion_type: 'fixed_amount', fixed_conversion_amount: 10_000_000,
    max_tax_rate: 24, tax_payment_source: 'from_ira',
  },
  // Tax > RMD: small RMD vs large conversion tax → partial extra pull expected.
  // Age 73, $250K IRA (RMD ~$9.4K) with a $200K conversion, tax from IRA.
  'F_taxGTrmd_from_ira': {
    ...base, age: 73, end_age: 85, qualified_account_value: 25_000_000,
    conversion_type: 'fixed_amount', fixed_conversion_amount: 20_000_000,
    max_tax_rate: 32, tax_payment_source: 'from_ira',
  },
};

for (const [name, c] of Object.entries(scenarios)) {
  const rows = growth(c);
  // first year with a conversion
  const conv = rows.find((r: any) => (r.conversionAmount ?? 0) > 0) ?? rows[0];
  const fin = rows[rows.length - 1];
  const nw = (r: any) => (r.traditionalBalance ?? 0) + (r.rothBalance ?? 0) + Math.max(0, r.taxableBalance ?? 0);
  console.log(`\n=== ${name} ===`);
  console.log(`  CONV YEAR age ${conv.age}: rmd=${d(conv.rmdAmount)} conv=${d(conv.conversionAmount)} ` +
    `totalIRAwd=${d(conv.totalIRAWithdrawal)} taxFromIRA=${d(conv.taxesPaidFromIRA)} ` +
    `taxExt=${d(conv.taxesPaidExternally)} fedTax=${d(conv.federalTax)} trad=${d(conv.traditionalBalance)} ` +
    `roth=${d(conv.rothBalance)} taxable=${d(conv.taxableBalance)} NW=${d(nw(conv))}`);
  console.log(`  FINAL    age ${fin.age}: trad=${d(fin.traditionalBalance)} roth=${d(fin.rothBalance)} ` +
    `taxable=${d(fin.taxableBalance)} NW=${d(nw(fin))}`);
  // machine-diffable line
  console.log(`  JSON ${JSON.stringify({ n: name, cAge: conv.age, rmd: conv.rmdAmount, conv: conv.conversionAmount,
    tIRAwd: conv.totalIRAWithdrawal, taxIRA: conv.taxesPaidFromIRA, taxExt: conv.taxesPaidExternally,
    fed: conv.federalTax, trad: conv.traditionalBalance, roth: conv.rothBalance, taxbl: conv.taxableBalance,
    finTrad: fin.traditionalBalance, finRoth: fin.rothBalance, finTaxbl: fin.taxableBalance, finNW: nw(fin) })}`);
}
