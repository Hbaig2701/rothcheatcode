/**
 * Verifies the new separate AUM growth rate (aum_growth_rate).
 *   - blank/null falls back to rate_of_return (backward compatible)
 *   - the AUM brokerage compounds at aum_growth_rate, independent of the annuity rate
 *   - the pending-IRA portion still grows at the IRA rate (not the AUM rate)
 *
 * Engine operates in CENTS. Run: npx tsx scripts/test-aum-growth-rate.ts
 */

import { runAumScenario } from "../lib/calculations/scenarios/aum";
import type { Client } from "../lib/types/client";

const M = 100_000_000; // $1,000,000 in cents

function makeClient(overrides: Partial<Client>): Client {
  return {
    age: 65,
    rate_of_return: 5,
    growth_rate: 5,
    aum_fee_percent: 0,
    aum_dividend_yield: 0,
    aum_turnover_percent: 0,
    aum_withdrawal_years: 1,
    max_tax_rate: 24,
    ltcg_rate: 15,
    state_tax_rate: 0,
    state: "TX",
    filing_status: "single",
    spouse_age: null,
    withdrawals: [],
    ...overrides,
  } as unknown as Client;
}

function run(overrides: Partial<Client>) {
  return runAumScenario({
    client: makeClient(overrides),
    startYear: 2026,
    projectionYears: 11,
    startingIraPortion: M,
  });
}

const fmt = (cents: number) => "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓ PASS" : "✗ FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  cond ? pass++ : fail++;
}

console.log("Annuity/IRA rate = 5% in all runs. $1,000,000 into AUM.\n");

// --- Run A: aum_growth_rate blank → should fall back to 5%
const A = run({ aum_growth_rate: null });
// --- Run B: aum_growth_rate = 5 (explicit) → should match A exactly
const B = run({ aum_growth_rate: 5 });
// --- Run C: aum_growth_rate = 8.5 → should compound faster
const C = run({ aum_growth_rate: 8.5 });

const finalA = A[A.length - 1].taxableBalance;
const finalB = B[B.length - 1].taxableBalance;
const finalC = C[C.length - 1].taxableBalance;

console.log(`Final AUM balance after 11 yrs:`);
console.log(`  A (blank → 5%):   ${fmt(finalA)}`);
console.log(`  B (explicit 5%):  ${fmt(finalB)}`);
console.log(`  C (8.5%):         ${fmt(finalC)}\n`);

check("blank aum_growth_rate == explicit 5% (backward compatible)", finalA === finalB);
check("8.5% AUM ends higher than 5% AUM", finalC > finalA, `+${fmt(finalC - finalA)}`);

// --- Clean post-transfer year: growth/BOY should equal the configured rate exactly.
// withdrawal_years=1, so year offset 5 has no transfer and no fees/divs.
function impliedRate(rows: ReturnType<typeof run>, offset: number) {
  const r = rows[offset];
  return (r.taxableGrowth ?? 0) / (r.taxableBOY ?? 1);
}
const rateA = impliedRate(A, 5);
const rateC = impliedRate(C, 5);
check("AUM compounds at 5.0% when set to 5", Math.abs(rateA - 0.05) < 1e-6, `measured ${(rateA * 100).toFixed(4)}%`);
check("AUM compounds at 8.5% when set to 8.5 (independent of annuity 5%)", Math.abs(rateC - 0.085) < 1e-6, `measured ${(rateC * 100).toFixed(4)}%`);

// --- Split check: pending IRA must grow at the IRA rate (5%), NOT the AUM rate.
// Spread the transfer over 3 years so there's pending IRA to observe.
const D = run({ aum_growth_rate: 8.5, rate_of_return: 5, growth_rate: 5, aum_withdrawal_years: 3 });
// Year offset 1: still mid-transfer. pending IRA after this year's transfer = traditionalBOY - iraWithdrawal.
const d1 = D[1];
const pendingAfterTransfer = (d1.traditionalBOY ?? 0) - (d1.iraWithdrawal ?? 0);
const iraGrowth = d1.traditionalGrowth ?? 0;
const expectedIraGrowth = Math.round(pendingAfterTransfer * 0.05); // IRA rate
const expectedIfWrong = Math.round(pendingAfterTransfer * 0.085);  // AUM rate (the bug)
check(
  "pending IRA grows at IRA rate 5%, not AUM rate 8.5%",
  iraGrowth === expectedIraGrowth && iraGrowth !== expectedIfWrong,
  `growth ${fmt(iraGrowth)} (5%=${fmt(expectedIraGrowth)}, 8.5%=${fmt(expectedIfWrong)})`
);

console.log(`\n${fail === 0 ? "ALL PASS" : fail + " FAILED"} (${pass}/${pass + fail})`);
process.exit(fail === 0 ? 0 : 1);
