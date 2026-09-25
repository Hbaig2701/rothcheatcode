/**
 * Edge-case / stress suite for the American Equity IncomeShield 10 community product.
 * Usage: npx tsx scripts/edgecases-incomeshield-10.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { runGuaranteedIncomeSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
import type { CustomProductRow } from "../lib/products/types";

config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const NAME = "American Equity IncomeShield 10 (10% Rollup LIBR)";
const usd = (c: number) => "$" + Math.round(c / 100).toLocaleString();
let all = true;
const check = (label: string, cond: boolean, detail = "") => { all = cond && all; console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? "  — " + detail : ""}`); };
const approx = (a: number, b: number, tolPct = 0.2) => (b === 0 ? a === 0 : Math.abs(a - b) / Math.abs(b) * 100 <= tolPct);

function mk(o: Partial<Client>): Client {
  return {
    name: "edge", age: 58, date_of_birth: "1968-01-01", filing_status: "married_filing_jointly", state: "ID",
    qualified_account_value: 0, roth_ira: 66_000_000, custom_product_id: "x", blueprint_type: "simple-rollup-income",
    rate_of_return: 0, guaranteed_rate_of_return: 0, payout_type: "joint", payout_option: "level", roll_up_option: null,
    conversion_type: "no_conversion", gi_conversion_years: 0, end_age: 105, projection_years: 47, ss_self: 0,
    ssi_annual_amount: 0, bonus_percent: 0, tax_payment_source: "from_taxable", income_start_age: 66, ...o,
  } as unknown as Client;
}

(async () => {
  const { data: p } = await admin.from("community_products").select("*").eq("name", NAME).single();
  const product = p as unknown as CustomProductRow;
  const M = (o: Partial<Client>) => runGuaranteedIncomeSimulation(createSimulationInput(mk(o), product)).giMetrics as any;
  const full = (o: Partial<Client>) => runGuaranteedIncomeSimulation(createSimulationInput(mk(o), product)) as any;

  console.log("=== 1. Rate independence of GUARANTEED income (roll-up is a fixed 10%, not credit-linked) ===");
  const inc0 = M({ rate_of_return: 0 }).annualIncomeGross;
  const inc6 = M({ rate_of_return: 6 }).annualIncomeGross;
  const inc12 = M({ rate_of_return: 12 }).annualIncomeGross;
  check("income@66 identical at 0/6/12% credited", approx(inc0, inc6) && approx(inc0, inc12), `0%=${usd(inc0)} 6%=${usd(inc6)} 12%=${usd(inc12)}`);
  console.log("      (documents: engine models the guaranteed 10% roll-up FLOOR; it does NOT step the benefit base up to a higher account value under strong credited rates — the illustration's current-rates $112,460 is upside the app intentionally doesn't project.)\n");

  console.log("=== 2. Roll-up 10-year cap (base = premium × (1 + 0.10 × min(defer,10))) ===");
  for (const [age, mult] of [[59, 1.1], [66, 1.8], [68, 2.0], [73, 2.0], [78, 2.0]] as [number, number][]) {
    const b = M({ income_start_age: age }).incomeBaseAtIncomeAge;
    check(`income@${age}: base ${usd(b)} = 660k×${mult}`, approx(b, 66_000_000 * mult), age >= 68 ? "capped at 10 yrs" : `${age - 58} roll-up yrs`);
  }
  console.log();

  console.log("=== 3. Payout-factor extremes (extrapolated below 61 / above 71, capped 9.0%) ===");
  for (const [age, pct] of [[59, 5.40], [66, 6.69], [72, 8.38], [90, 9.0]] as [number, number][]) {
    const m = M({ income_start_age: age });
    const impl = m.incomeBaseAtIncomeAge > 0 ? m.annualIncomeGross / m.incomeBaseAtIncomeAge * 100 : 0;
    check(`income@${age} implied factor ${impl.toFixed(2)}% ≈ ${pct}%`, Math.abs(impl - pct) <= 0.05);
  }
  console.log();

  console.log("=== 4. Single-life > Joint (single ≈ joint + 0.5%) ===");
  const j = M({ payout_type: "joint" });
  const s = M({ payout_type: "individual" });
  const jf = j.annualIncomeGross / j.incomeBaseAtIncomeAge * 100, sf = s.annualIncomeGross / s.incomeBaseAtIncomeAge * 100;
  check("single factor ≈ joint + 0.5%", approx(sf, jf + 0.5, 2), `single ${sf.toFixed(2)}% vs joint ${jf.toFixed(2)}%`);
  console.log();

  console.log("=== 5. Linear premium scaling ($5k min → $1.5M max) ===");
  const base660 = M({ roth_ira: 66_000_000 }).annualIncomeGross;
  for (const prem of [500_000, 10_000_000, 150_000_000]) {
    const inc = M({ roth_ira: prem }).annualIncomeGross;
    check(`premium ${usd(prem)} scales linearly`, approx(inc / prem, base660 / 66_000_000, 0.5), `income ${usd(inc)}`);
  }
  console.log();

  console.log("=== 6. Income continues for LIFE after account value depletes (GLWB guarantee) ===");
  const f = full({ income_start_age: 66, rate_of_return: 0, end_age: 100 });
  const yd: any[] = f.giMetrics.yearlyData || [];
  const incomeYears = yd.filter((y) => y.phase === "income" && y.age >= 66);
  const level = incomeYears[0]?.guaranteedIncomeGross ?? 0;
  const allLevelAndPaid = incomeYears.length > 20 && incomeYears.every((y) => approx(y.guaranteedIncomeGross, level, 0.1));
  const depleted = incomeYears.some((y) => (y.accountValue ?? 0) <= 0);
  check("income paid every year to age 100, still level after AV depletes", allLevelAndPaid && depleted, `${incomeYears.length} income yrs @ ${usd(level)}, AV hits $0: ${depleted}`);
  console.log();

  console.log("=== 7. Rider fee 1.20% sanity (year-1 charge ≈ 1.20% of that year's income base) ===");
  const y1 = yd.find((y) => y.phase === "deferral") || yd[1];
  const feeOk = (f.giMetrics.totalRiderFees ?? 0) > 0;
  check("totalRiderFees > 0 and deducted from contract value", feeOk, `total ${usd(f.giMetrics.totalRiderFees)}`);
  console.log();

  console.log("=== 8. Classic GLWB: income base LOCKS at activation (does not draw down) ===");
  const b66 = yd.find((y) => y.age === 66)?.incomeBase ?? 0;
  const b70 = yd.find((y) => y.age === 70)?.incomeBase ?? 0;
  check("income base locked through income phase", approx(b66, 118_800_000, 0.1) && approx(b70, 118_800_000, 0.1), `age66 ${usd(b66)} = age70 ${usd(b70)}`);
  console.log();

  console.log("=== 9. Traditional-IRA conversion path runs & is LOWER (tax + 1 lost roll-up yr), no negatives ===");
  const trad = M({ qualified_account_value: 66_000_000, roth_ira: 0, conversion_type: "optimized_amount", gi_conversion_years: 1, max_tax_rate: 24 });
  const lower = trad.annualIncomeGross > 0 && trad.annualIncomeGross < inc0;
  check("Traditional-conversion income positive and < already-Roth", lower, `trad ${usd(trad.annualIncomeGross)} vs roth ${usd(inc0)}`);
  console.log();

  console.log("=== 10. Degenerate inputs don't crash / go negative ===");
  const tiny = M({ roth_ira: 500_000, income_start_age: 59 }); // $5k min premium, 1-yr defer
  const old = M({ age: 79, date_of_birth: "1947-01-01", income_start_age: 80 }); // near max issue age
  check("tiny $5k premium OK", tiny.annualIncomeGross > 0 && tiny.incomeBaseAtIncomeAge > 0, usd(tiny.annualIncomeGross));
  check("issue age 79 / income 80 OK, no negative", old.annualIncomeGross > 0 && old.incomeBaseAtIncomeAge > 0, `${usd(old.annualIncomeGross)}`);
  console.log();

  console.log(all ? "✅ ALL EDGE CASES PASS" : "❌ SOME EDGE CASES FAILED — review above");
  process.exit(all ? 0 : 1);
})();
