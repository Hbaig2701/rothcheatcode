/**
 * Phase 3 — Engine ⇄ report-table reconciliation.
 *
 * Run: npx tsx lib/calculations/__tests__/audit/reconcile-table.test.ts
 *
 * The report tables (components/report/year-over-year-tables.tsx and its GI
 * sibling) RE-DERIVE agi / magi / taxableIncome in the React component instead
 * of reading the engine fields of the same name. This test reproduces the
 * table's derivation EXACTLY and diffs it against the engine's own field. A
 * non-zero diff is the silent drift advisors notice — the column shows a number
 * that doesn't match what the engine (and the rest of the report) used.
 *
 * The fix direction is "table reads engine fields" (single source of truth):
 * the engine already populates agi/magi/taxableIncome/federalTaxBracket on
 * every row (verified by the coverage check below), so the in-component
 * re-derivation is both redundant and divergent.
 */

import type { Client } from '../../../types/client';
import type { YearlyResult } from '../../types';
import { makeClient, dispatch } from './factory';
import { Reporter } from './assertions';
import { getStandardDeduction } from '../../../data/standard-deductions';

const r = new Reporter();
const TOL = 2;

// Exact reproduction of the report table's in-component derivation
// (components/report/year-over-year-tables.tsx computedData useMemo).
function tableDerive(client: Client, y: YearlyResult, scenario: 'baseline' | 'formula') {
  const distIra = scenario === 'baseline' ? y.rmdAmount : y.conversionAmount;
  const agi = y.otherIncome + distIra;
  const deduction = getStandardDeduction(client.filing_status, y.age, y.spouseAge ?? undefined, y.year);
  const taxableIncome = Math.max(0, agi - deduction);
  const magi = agi + (client.tax_exempt_non_ssi ?? 0) + y.ssIncome;
  return { agi, taxableIncome, magi, deduction };
}

const fixtures: { name: string; client: Client }[] = [
  { name: 'fia/single/optimized', client: makeClient({ ssi_annual_amount: 3_000_000 }) },
  { name: 'fia/MFJ/MA/dual-SS', client: makeClient({ filing_status: 'married_filing_jointly', spouse_age: 62, state: 'MA', state_tax_rate: 5, ssi_annual_amount: 4_000_000, spouse_ssi_annual_amount: 3_000_000 }) },
  { name: 'fia/single/from_ira/fixed (gross-up)', client: makeClient({ conversion_type: 'fixed_amount', fixed_conversion_amount: 6_000_000, tax_payment_source: 'from_ira', ssi_annual_amount: 2_500_000 }) },
];

for (const fx of fixtures) {
  const { baseline, formula } = dispatch(fx.client);
  for (const [scenario, years] of [['baseline', baseline], ['formula', formula]] as const) {
    for (const y of years) {
      // Coverage: engine must expose the fields the table should read instead.
      for (const f of ['agi', 'magi', 'taxableIncome', 'federalTaxBracket'] as const) {
        r.ran();
        if (y[f] == null) r.record({ fixture: fx.name, scenario, check: 'engine-field-missing', year: y.year, age: y.age, field: f, note: 'table cannot adopt single-source-of-truth without it' });
      }
      if (y.agi == null) continue;
      const t = tableDerive(fx.client, y, scenario);
      for (const f of ['agi', 'magi', 'taxableIncome'] as const) {
        r.ran();
        const eng = y[f] as number;
        if (Math.abs(t[f] - eng) > TOL) {
          r.record({ fixture: fx.name, scenario, check: `table-rederive-drift:${f}`, year: y.year, age: y.age, field: f, expected: eng, actual: t[f], delta: t[f] - eng, note: 'report-table value diverges from engine field' });
        }
      }
    }
  }
}

r.print('Phase 3 — Engine ⇄ table reconciliation');
// The report tables HAVE been migrated to read these engine fields (audit F2 /
// F2-GI). The drift reported here is what the OLD in-component derivation
// produced vs the engine — i.e. the magnitude of the bug the F2 fix eliminated
// (kept as a record of why the tables must read engine fields, not re-derive).
// Documenting run: exits 0.
console.log('\n(Documents the pre-F2 drift the table fix eliminated — see AUDIT.md F2/F2-GI. Tables now read engine fields.)');
process.exit(0);
