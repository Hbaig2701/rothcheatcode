/**
 * Phase 2 (GI) — independent progressive-tax recompute for the GUARANTEED-INCOME
 * strategy. The general recompute.test.ts covers only the standard/growth
 * engines; the GI strategy's conversion + income tax path was never re-derived,
 * which is exactly how F15/F16/F17 survived. This permanently guards them on the
 * input shapes the old GI fixtures lacked: Social Security, a taxable pension,
 * legacy mode, and the from-IRA gross-up.
 *
 *   F15  conversion tax MUST equal the progressive marginal tax on the same IRA
 *        distribution the engine took (gross-up included), NOT a flat bracket.
 *   F16  the strategy income phase MUST tax the still-taxable pension + SS (the
 *        Roth GI is excluded) — not report $0.
 *   F17  the strategy's Roth annuity is tax-free to heirs, so heirBenefit MUST
 *        equal the baseline (traditional annuity) heir tax, not net to ~0.
 *
 * Run: npx tsx lib/calculations/__tests__/audit/gi-tax-recompute.test.ts
 */

import type { Client } from '../../../types/client';
import { makeClient, dispatch } from './factory';
import { Reporter } from './assertions';
import { computeTaxableIncomeWithSS } from '../../tax-helpers';
import { calculateFederalTax } from '../../modules/federal-tax';
import { calculateStateTax } from '../../modules/state-tax';
import { getEffectiveDeduction } from '../../../data/standard-deductions';
import { getStateTaxRate } from '../../../data/states';

const r = new Reporter();
const TOL = 200; // ±$2 — rounding slack on a multi-step independent recompute

function stateRate(c: Client): number {
  return c.state_tax_rate != null ? c.state_tax_rate / 100 : getStateTaxRate(c.state);
}

/** Total federal+state tax owed on an ordinary-income base (+ SS torpedo). */
function totalTax(c: Client, year: number, age: number, spouseAge: number | undefined, ordinary: number, ss: number) {
  const deductions = getEffectiveDeduction(c.filing_status, age, spouseAge, year, c.additional_deductions);
  const info = computeTaxableIncomeWithSS({ otherIncome: ordinary, ssBenefits: ss, taxExemptInterest: 0, deductions, filingStatus: c.filing_status });
  const fed = calculateFederalTax({ taxableIncome: info.taxableIncome, filingStatus: c.filing_status, taxYear: year }).totalTax;
  const state = calculateStateTax({ taxableIncome: info.taxableIncome, state: c.state, filingStatus: c.filing_status, overrideRate: stateRate(c) }).totalTax;
  return fed + state;
}

interface Probe { name: string; client: Client; }

const PROBES: Probe[] = [
  { name: 'single/SS+pension/CA/income@70/from_taxable', client: makeClient({
    blueprint_type: 'generic-income', filing_status: 'single', age: 62, end_age: 92,
    qualified_account_value: 120_000_000, taxable_accounts: 40_000_000, state: 'CA', state_tax_rate: 9.3,
    ssi_annual_amount: 3_600_000, ssi_payout_age: 67, gross_taxable_non_ssi: 4_800_000,
    gi_conversion_years: 5, income_start_age: 70, tax_payment_source: 'from_taxable', heir_tax_rate: 40 }) },
  { name: 'mfj/legacy/SS/TX/from_taxable', client: makeClient({
    blueprint_type: 'generic-income', filing_status: 'married_filing_jointly', age: 65, end_age: 90, spouse_age: 63,
    qualified_account_value: 200_000_000, taxable_accounts: 30_000_000, state: 'TX',
    ssi_annual_amount: 4_800_000, ssi_payout_age: 67, gi_conversion_years: 6,
    gi_legacy_mode: true, tax_payment_source: 'from_taxable', heir_tax_rate: 40 } as Partial<Client>) },
  { name: 'single/SS+pension/NY/income@72/from_ira(grossup)', client: makeClient({
    blueprint_type: 'generic-income', filing_status: 'single', age: 60, end_age: 90,
    qualified_account_value: 80_000_000, taxable_accounts: 0, state: 'NY', state_tax_rate: 6.85,
    ssi_annual_amount: 3_000_000, ssi_payout_age: 67, gross_taxable_non_ssi: 6_000_000,
    gi_conversion_years: 5, income_start_age: 72, tax_payment_source: 'from_ira', heir_tax_rate: 40 }) },
];

for (const { name, client } of PROBES) {
  const { formula, baseline, result } = dispatch(client);
  const ssAmount = client.ssi_annual_amount ?? 0;
  const ssStart = client.ssi_payout_age ?? 67;
  const pension = client.gross_taxable_non_ssi ?? 0;
  const payFromIRA = client.tax_payment_source === 'from_ira' || (client.taxable_accounts ?? 0) <= 0;

  for (const y of formula) {
    const age = y.age;
    const yearsSS = age >= ssStart ? age - ssStart : -1;
    const ss = yearsSS >= 0 ? Math.round(ssAmount * Math.pow(1 + 0.02, yearsSS)) : 0;
    const spouseAge = y.spouseAge ?? undefined;

    // F15: conversion tax == progressive marginal tax on the SAME distribution.
    if (y.giPhase === 'conversion' && y.conversionAmount > 0) {
      const engineConv = (y.federalTaxOnConversions ?? 0) + (y.stateTaxOnConversions ?? 0);
      const dist = y.conversionAmount + (payFromIRA ? engineConv : 0);
      const rmdInBase = (y.federalTaxOnOrdinaryIncome ?? 0) > 0 ? (y.rmdAmount ?? 0) : 0;
      const base = pension + rmdInBase;
      const expected = totalTax(client, y.year, age, spouseAge, base + dist, ss) - totalTax(client, y.year, age, spouseAge, base, ss);
      r.ran();
      if (Math.abs(engineConv - expected) > TOL) {
        r.record({ fixture: name, scenario: 'formula', check: 'F15.conversionTaxProgressive', year: y.year, age, field: 'convTax', expected, actual: engineConv, delta: engineConv - expected });
      }
    }

    // F16: income-phase tax == real total tax on pension + taxable SS (GI excluded).
    if (y.giPhase === 'income') {
      const engineTax = y.federalTax + y.stateTax;
      const expected = totalTax(client, y.year, age, spouseAge, pension, ss);
      r.ran();
      if (Math.abs(engineTax - expected) > TOL) {
        r.record({ fixture: name, scenario: 'formula', check: 'F16.incomePhasePensionSSTax', year: y.year, age, field: 'federal+state', expected, actual: engineTax, delta: engineTax - expected });
      }
    }
  }

  // F17: heirBenefit == baseline traditional annuity heir tax (strategy Roth = $0).
  const heirRate = (client.heir_tax_rate ?? 40) / 100;
  const lastBase = baseline[baseline.length - 1];
  const expectedHeir = Math.round(lastBase.traditionalBalance * heirRate);
  const engineHeir = (result as { heirBenefit?: number }).heirBenefit ?? 0;
  r.ran();
  if (Math.abs(engineHeir - expectedHeir) > TOL) {
    r.record({ fixture: name, scenario: 'formula', check: 'F17.heirBenefitRothAnnuityTaxFree', field: 'heirBenefit', expected: expectedHeir, actual: engineHeir, delta: engineHeir - expectedHeir });
  }
}

r.print('GI strategy tax recompute (F15/F16/F17 guard)');
process.exit(r.breaches.length > 0 ? 1 : 0);
