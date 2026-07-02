/**
 * Edge-case / correctness audit for the Athene Agility 10 (GI) build.
 *
 *  PART 1 — STATE RESOLUTION: mirrors new-account.tsx (surrender_overrides[state]
 *           ?? surrender.schedule; bonus_overrides[state] ?? bonus.percentage) for
 *           all states + not-available + min-premium overrides.
 *  PART 2 — ENGINE SANITY: runs the full GI Roth-conversion strategy across
 *           realistic + extreme profiles (issue ages, income-start ages, balances,
 *           married, rates, payout-age clamp, long deferral) and asserts no NaN /
 *           negative / absurd values, monotonic roll-up, guaranteed-floor income.
 *
 * Usage: npx tsx scripts/audit-athene-agility-10.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { runGuaranteedIncomeSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
import type { CustomProductRow } from "../lib/products/types";

config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const PRODUCT_ID = "287cd15a-08f0-467b-894a-37af0176c36c"; // Hamza master
const usd = (c: number) => "$" + Math.round(c / 100).toLocaleString();
const ALL_STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
let problems = 0;
const flag = (m: string) => { problems++; console.log("  ⚠️  " + m); };

(async () => {
  const { data: p } = await admin.from("custom_products").select("*").eq("id", PRODUCT_ID).single();
  const product = p as CustomProductRow;
  const cfg = product.config;
  const sa = cfg.state_availability!;
  const inc = cfg.income!;

  // ---- PART 1: STATE RESOLUTION ----------------------------------------
  console.log("=== PART 1: per-state resolution (mirrors new-account.tsx) ===");
  for (const st of ALL_STATES) {
    if (["GU", "NY", "PR", "VI"].includes(st)) {
      if (!sa.not_available.includes(st)) flag(`${st}: expected not-available`);
      continue;
    }
    if (sa.not_available.includes(st)) flag(`${st}: unexpectedly not-available`);
    const bonus = (sa.bonus_overrides?.[st] as number | undefined) ?? cfg.bonus.percentage;
    if (bonus !== 55) flag(`${st}: income-base bonus ${bonus}% but expected 55%`);
    const sched = (sa.surrender_overrides?.[st] as number[] | undefined) ?? cfg.surrender.schedule;
    if (sched.length !== cfg.surrender.years) flag(`${st}: surrender len ${sched.length} != years ${cfg.surrender.years}`);
    if (sched.some((v) => v < 0 || v > 100)) flag(`${st}: surrender out of range`);
  }
  // payout table sane: monotonic non-decreasing, in [0,30]
  const ages = Object.keys(inc.payout_factors.single).map(Number).sort((a, b) => a - b);
  let prev = -1;
  for (const a of ages) {
    const v = inc.payout_factors.single[String(a)];
    if (!finite(v) || v < 0 || v > 30) flag(`payout single@${a}=${v} out of range`);
    if (v < prev - 1e-9) flag(`payout single not monotonic at age ${a} (${v} < ${prev})`);
    prev = v;
  }
  console.log(`  bonus=${cfg.bonus.percentage}% all states | multiple=${inc.roll_up_interest_multiple}× | payout 60:${inc.payout_factors.single["60"]} 65:${inc.payout_factors.single["65"]} 70:${inc.payout_factors.single["70"]} | not-avail=[${sa.not_available.join(",")}]`);
  console.log(`  Part 1 issues: ${problems}`);
  console.log();

  // ---- PART 2: ENGINE SANITY -------------------------------------------
  console.log("=== PART 2: full GI-strategy sanity across profiles ===");
  const base = {
    custom_product_id: PRODUCT_ID, blueprint_type: "flat-rate-compound-income",
    payout_type: "individual", payout_option: "level", roll_up_option: null,
    ss_self: 0, ssi_annual_amount: 0, tax_payment_source: "from_taxable",
    bonus_percent: 55, gi_conversion_years: 1, end_age: 105, projection_years: 45,
  };
  type Profile = { label: string; c: Partial<Client>; expectFloorIncomeAtZero?: boolean };
  const profiles: Profile[] = [
    { label: "CA 55 single $300k income@65 (illustration)", c: { age: 55, date_of_birth: "1971-01-01", filing_status: "single", state: "CA", qualified_account_value: 30_000_000, income_start_age: 65 } },
    { label: "GA 60 MFJ $1M income@70 (spouse 58)", c: { age: 60, date_of_birth: "1966-01-01", filing_status: "married_filing_jointly", spouse_age: 58, state: "GA", qualified_account_value: 100_000_000, income_start_age: 70 } },
    { label: "TX 68 single $500k income@78", c: { age: 68, date_of_birth: "1958-01-01", filing_status: "single", state: "TX", qualified_account_value: 50_000_000, income_start_age: 78 } },
    { label: "EDGE: income@current age (no deferral)", c: { age: 66, date_of_birth: "1960-01-01", filing_status: "single", state: "AL", qualified_account_value: 40_000_000, income_start_age: 66 } },
    { label: "EDGE: issue 80 income@90 (old, near table top)", c: { age: 80, date_of_birth: "1946-01-01", filing_status: "single", state: "AL", qualified_account_value: 40_000_000, income_start_age: 90 } },
    { label: "EDGE: income@95 (payout-table top / clamp)", c: { age: 70, date_of_birth: "1956-01-01", filing_status: "single", state: "AL", qualified_account_value: 40_000_000, income_start_age: 95 } },
    { label: "EDGE: income@98 (beyond table → clamp)", c: { age: 70, date_of_birth: "1956-01-01", filing_status: "single", state: "AL", qualified_account_value: 40_000_000, income_start_age: 98 } },
    { label: "EDGE: long deferral issue 55 income@90 (35y > 30 cap)", c: { age: 55, date_of_birth: "1971-01-01", filing_status: "single", state: "AL", qualified_account_value: 30_000_000, income_start_age: 90 } },
    { label: "EDGE: 0% credited (guaranteed floor)", c: { age: 55, date_of_birth: "1971-01-01", filing_status: "single", state: "CA", qualified_account_value: 30_000_000, income_start_age: 65, rate_of_return: 0 }, expectFloorIncomeAtZero: true },
    { label: "EDGE: high 9% rate $300k income@65", c: { age: 55, date_of_birth: "1971-01-01", filing_status: "single", state: "CA", qualified_account_value: 30_000_000, income_start_age: 65, rate_of_return: 9 } },
    { label: "EDGE: tiny $30k income@65", c: { age: 55, date_of_birth: "1971-01-01", filing_status: "single", state: "AL", qualified_account_value: 3_000_000, income_start_age: 65 } },
  ];

  for (const { label, c, expectFloorIncomeAtZero } of profiles) {
    const rate = c.rate_of_return ?? 5.25;
    const client = { ...base, ...c, rate_of_return: rate, guaranteed_rate_of_return: rate, baseline_comparison_rate: rate } as unknown as Client;
    let res;
    try { res = runGuaranteedIncomeSimulation(createSimulationInput(client, product)); }
    catch (e: any) { flag(`${label}: THREW ${e.message}`); continue; }
    const { formula, giMetrics: m, heirBenefit, totalTaxSavings } = res;
    const issues: string[] = [];
    for (const y of formula) {
      if (![y.traditionalBalance, y.rothBalance, y.taxableBalance, y.totalTax, y.netWorth].every(finite)) { issues.push(`non-finite year age ${y.age}`); break; }
      if (y.traditionalBalance < -1 || y.rothBalance < -1 || y.taxableBalance < -1 || y.netWorth < -1) { issues.push(`negative balance age ${y.age}`); break; }
    }
    if (![m.annualIncomeGross, m.incomeBaseAtIncomeAge, m.incomeBaseAtStart, m.purchaseAmount, m.payoutPercent].every(finite)) issues.push("non-finite giMetrics");
    if (m.annualIncomeGross < 0) issues.push(`negative income ${usd(m.annualIncomeGross)}`);
    if (m.incomeBaseAtIncomeAge < m.incomeBaseAtStart - 1) issues.push(`income base shrank: start ${usd(m.incomeBaseAtStart)} → @age ${usd(m.incomeBaseAtIncomeAge)}`);
    if (m.purchaseAmount > 1 && m.annualIncomeGross <= 0) issues.push(`funded (${usd(m.purchaseAmount)}) but income is 0 — funding/deferral bug?`);
    if (!finite(heirBenefit) || !finite(totalTaxSavings)) issues.push("non-finite comparison metric");
    // Guaranteed floor: at 0% credited, income base = purchase × 1.55 (no roll-up).
    if (expectFloorIncomeAtZero) {
      const expectedBase = m.purchaseAmount * 1.55;
      if (Math.abs(m.incomeBaseAtIncomeAge - expectedBase) > expectedBase * 0.01) issues.push(`0% income base ${usd(m.incomeBaseAtIncomeAge)} != purchase×1.55 ${usd(expectedBase)}`);
    }
    issues.forEach((i) => flag(`${label}: ${i}`));
    const ok = issues.length === 0 ? "ok" : "SEE ABOVE";
    console.log(`  ${label}`);
    console.log(`     purchase=${usd(m.purchaseAmount)} | base start→@age ${usd(m.incomeBaseAtStart)}→${usd(m.incomeBaseAtIncomeAge)} | payout=${m.payoutPercent.toFixed(2)}% | income=${usd(m.annualIncomeGross)} | depletion=${m.depletionAge ?? "—"} | heir=${usd(heirBenefit)} [${ok}]`);
  }
  console.log();
  // Monotonicity of income base in rate (a clean global invariant)
  console.log("=== roll-up monotonic in rate (issue 55, income@65) ===");
  let lastBase = -1; let mono = true;
  for (const r of [0, 2, 4, 6, 8]) {
    const cl = { ...base, age: 55, date_of_birth: "1971-01-01", filing_status: "single", state: "CA", qualified_account_value: 30_000_000, income_start_age: 65, rate_of_return: r, guaranteed_rate_of_return: r, baseline_comparison_rate: r } as unknown as Client;
    const { giMetrics: m } = runGuaranteedIncomeSimulation(createSimulationInput(cl, product));
    if (m.incomeBaseAtIncomeAge < lastBase - 1) { mono = false; flag(`income base not monotonic at ${r}%`); }
    lastBase = m.incomeBaseAtIncomeAge;
    console.log(`  @${r}% → base ${usd(m.incomeBaseAtIncomeAge)} | income ${usd(m.annualIncomeGross)}`);
  }
  if (mono) console.log("  monotonic ✓");
  console.log();
  console.log(problems === 0 ? "✅ AUDIT CLEAN — no problems found." : `❌ AUDIT FOUND ${problems} problem(s).`);
  process.exit(problems === 0 ? 0 : 1);
})();
