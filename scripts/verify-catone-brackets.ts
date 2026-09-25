/**
 * Verify the Mike Catone diagnosis with precise per-year numbers:
 *  - pre-conversion (base) taxable income
 *  - standard deduction actually used
 *  - taxable SS amount + %
 *  - inflation-adjusted top of the 24% bracket each year
 *  - assert: taxable income (with conversion) <= 24% ceiling
 *
 * Usage: npx tsx scripts/verify-catone-brackets.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import { computeTaxableIncomeWithSS } from "../lib/calculations/tax-helpers";
import { getEffectiveDeduction } from "../lib/data/standard-deductions";
import { getFederalBrackets } from "../lib/data/federal-brackets-2026";
import type { Client } from "../lib/types/client";

config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const usd = (c: number) => "$" + Math.round((c ?? 0) / 100).toLocaleString();

(async () => {
  const { data: rows } = await admin.from("clients").select("*").ilike("name", "%catone%");
  const c = (rows as Client[])[0];
  const input = createSimulationInput(c, null);
  const sim = runGrowthSimulation(input);

  // Sum this year's non-SSI income entries (base income before any conversion/RMD).
  const incomeForYear = (year: number) =>
    (c.non_ssi_income ?? [])
      .filter((e) => e.year === year)
      .reduce((s, e) => s + (e.gross_taxable ?? 0), 0);

  console.log(`Client: ${c.name} | ${c.filing_status} | age ${c.age} | SS ${usd(c.ssi_annual_amount)}/yr (starts ${c.ssi_payout_age})`);
  console.log("");
  console.log("age | baseTaxInc(noConv) | deduction | taxableSS(%)  || conv      | taxIncWITHconv | 24%ceiling  | underCeiling?");

  let allUnder = true;
  for (const y of sim.formula.slice(0, 14)) {
    const age = y.age;
    const ssThisYear = age >= c.ssi_payout_age ? c.ssi_annual_amount : 0;
    const otherInc = incomeForYear(y.year);
    const deduction = getEffectiveDeduction(c.filing_status, age, undefined, y.year, c.additional_deductions);

    // Base (no conversion, no RMD) taxable income
    const base = computeTaxableIncomeWithSS({
      otherIncome: otherInc,
      ssBenefits: ssThisYear,
      taxExemptInterest: 0,
      deductions: deduction,
      filingStatus: c.filing_status,
      age,
      spouseAge: undefined,
      taxYear: y.year,
    });

    // Inflation-adjusted 24% ceiling for this year (top of the 24% bracket).
    const brackets = getFederalBrackets(y.year, c.filing_status);
    const b24 = brackets.find((b) => b.rate === 24)!;
    const ceiling24 = b24.upper;

    const taxIncWithConv = y.taxableIncome ?? 0;
    const under = taxIncWithConv <= ceiling24;
    if (!under) allUnder = false;

    console.log(
      `${String(age).padStart(3)} | ${usd(base.taxableIncome).padStart(18)} | ${usd(deduction).padStart(9)} | ${usd(base.taxableSS).padStart(8)}(${String(base.ssTaxablePercent).padStart(2)}%) || ${usd(y.conversionAmount).padStart(9)} | ${usd(taxIncWithConv).padStart(14)} | ${usd(ceiling24).padStart(11)} | ${under ? "YES ✓" : "NO ✗ OVER"}`
    );
  }
  console.log("");
  console.log(allUnder ? "RESULT: every year's taxable income stays AT/UNDER the 24% ceiling ✓" : "RESULT: some year EXCEEDS the 24% ceiling ✗");
})();
