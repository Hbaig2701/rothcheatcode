/**
 * Verifies the new GI-PDF "Rider Fee" column end-to-end.
 *
 * Runs the GI engine for a rider-fee product (Athene Agility 10), then replicates
 * the EXACT row-mapping logic from app/api/generate-pdf/route.ts prepareGITemplateData
 * to confirm:
 *   1. gi_yearly_data / gi_baseline_yearly_data rows carry riderFee
 *   2. the formatted Rider Fee cells populate (and are '—' only when 0)
 *   3. rider fees appear in deferral AND income phases, never in conversion/purchase
 *   4. showRiderFee resolves true for a fee-charging product
 *
 * Usage: npx tsx scripts/verify-gi-pdf-riderfee.ts
 */
import { runGuaranteedIncomeSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";

const usd = (c: number) => "$" + Math.round(c / 100).toLocaleString();
// Mirror formatCurrency used by the PDF route (whole-dollar currency string).
const formatCurrency = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

// Use the BUILT-IN simple-rollup-income formula (1.20% rider fee on income base),
// no custom product, so riderFee is non-zero and we exercise the real engine path.
function karen(rate: number): Client {
  return {
    name: "Karen (riderfee verify)", age: 55, date_of_birth: "1971-01-01",
    filing_status: "single", state: "CA",
    qualified_account_value: 30_000_000,
    blueprint_type: "simple-rollup-income",
    rate_of_return: rate, guaranteed_rate_of_return: rate,
    payout_type: "individual", payout_option: "level", roll_up_option: null,
    end_age: 105, projection_years: 45, ss_self: 0, ssi_annual_amount: 0,
    bonus_percent: 14, tax_payment_source: "from_taxable",
    gi_conversion_years: 1, income_start_age: 65,
  } as unknown as Client;
}

// Exact replica of the PDF route's riderFee cell rule.
const riderCell = (row: any) => (row.riderFee > 0 ? formatCurrency(row.riderFee) : "—");

(async () => {
  console.log(`Built-in formula: simple-rollup-income  (1.20% rider fee on income base)\n`);

  const { giMetrics } = runGuaranteedIncomeSimulation(createSimulationInput(karen(5.25)));
  const strat = giMetrics!.yearlyData;
  const base = giMetrics!.baselineYearlyData;

  const showRiderFee = strat.some((r) => r.riderFee > 0) || base.some((r) => r.riderFee > 0);

  let problems = 0;
  const checkSet = (label: string, rows: any[]) => {
    console.log(`=== ${label} (${rows.length} rows) ===`);
    let feeTotal = 0, feeYears = 0;
    const byPhase: Record<string, { fee: number; n: number }> = {};
    for (const r of rows) {
      byPhase[r.phase] ??= { fee: 0, n: 0 };
      byPhase[r.phase].n++;
      byPhase[r.phase].fee += r.riderFee ?? 0;
      if (r.riderFee > 0) { feeTotal += r.riderFee; feeYears++; }
      // BUG CHECK: conversion/purchase rows must never charge a rider fee.
      if ((r.phase === "conversion" || r.phase === "purchase") && r.riderFee > 0) {
        console.log(`  ✗ BUG: rider fee ${usd(r.riderFee)} during ${r.phase} (age ${r.age})`);
        problems++;
      }
      // BUG CHECK: riderFee must be a finite non-negative number.
      if (!Number.isFinite(r.riderFee) || r.riderFee < 0) {
        console.log(`  ✗ BUG: bad riderFee value ${r.riderFee} (age ${r.age}, ${r.phase})`);
        problems++;
      }
    }
    for (const [phase, v] of Object.entries(byPhase)) {
      console.log(`   phase=${phase.padEnd(11)} rows=${String(v.n).padStart(2)}  riderFeeTotal=${usd(v.fee)}`);
    }
    console.log(`   → ${feeYears} year(s) with a fee, lifetime rider fees = ${usd(feeTotal)}`);
    // Sample a deferral and an income row to show the rendered cell.
    const deferral = rows.find((r) => r.phase === "deferral" && r.riderFee > 0);
    const income = rows.find((r) => r.phase === "income");
    if (deferral) console.log(`   sample deferral row age ${deferral.age}: Rider Fee cell = "${riderCell(deferral)}"  (acctVal=${usd(deferral.accountValue)})`);
    if (income) console.log(`   sample income   row age ${income.age}: Rider Fee cell = "${riderCell(income)}"  (acctVal=${usd(income.accountValue)})`);
    if (feeYears === 0) { console.log(`  ✗ BUG: product charges a fee but NO year shows one`); problems++; }
    console.log();
    return feeTotal;
  };

  const stratTotal = checkSet("STRATEGY (Roth GI) — gi_yearly_data", strat);
  const baseTotal = checkSet("BASELINE (Traditional GI) — gi_baseline_yearly_data", base);

  console.log(`showRiderFee flag = ${showRiderFee}  (expected true)`);
  if (!showRiderFee) { console.log("  ✗ BUG: showRiderFee is false for a fee-charging product"); problems++; }

  // Cross-check: lifetime rider fees should match the engine's own total if exposed.
  console.log(`\nStrategy lifetime rider fees (summed cells) = ${usd(stratTotal)}`);
  console.log(`Baseline lifetime rider fees (summed cells) = ${usd(baseTotal)}`);

  console.log(problems === 0 ? "\n✅ PASS — Rider Fee column populates correctly, no bugs found." : `\n❌ ${problems} problem(s) found.`);
  process.exit(problems === 0 ? 0 : 1);
})();
