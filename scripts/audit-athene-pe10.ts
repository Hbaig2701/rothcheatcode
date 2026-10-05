/**
 * Edge-case / correctness audit for the Athene Performance Elite 10 Plus build.
 *
 *  PART 1 — STATE RESOLUTION: mirrors new-account.tsx applyCustomProduct()
 *           exactly (bonus_overrides[state] ?? bonus.percentage; surrender_
 *           overrides[state] ?? surrender.schedule) for all states + the
 *           not-available list, and flags anything that looks wrong.
 *  PART 2 — ENGINE SANITY: runs the FULL Roth-conversion strategy across
 *           realistic + extreme client profiles and asserts no NaN / negative /
 *           absurd values, strategy vs baseline coherence, bonus application.
 *
 * Usage: npx tsx scripts/audit-athene-pe10.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
import type { CustomProductRow } from "../lib/products/types";

config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const PRODUCT_ID = "8d7d7da3-1692-41c2-968d-4d71ef64e394"; // Hamza master
const usd = (c: number) => "$" + Math.round(c / 100).toLocaleString();
const ALL_STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");

let problems = 0;
const flag = (msg: string) => { problems++; console.log("  ⚠️  " + msg); };

(async () => {
  const { data: p } = await admin.from("custom_products").select("*").eq("id", PRODUCT_ID).single();
  const product = p as CustomProductRow;
  const cfg = product.config;
  const sa = cfg.state_availability!;

  // ---- PART 1: STATE RESOLUTION ----------------------------------------
  console.log("=== PART 1: per-state bonus + surrender resolution (mirrors new-account.tsx) ===");
  // Expected ≤70 bonus per the carrier Variations table:
  const expectBonus = (st: string): number => {
    if (["GU", "NY", "PR", "VI"].includes(st)) return NaN; // not available
    if (st === "CA") return 20;
    if (["AK","CT","DE","ID","LA","MN","NV","NJ","OH","OK","OR","PA","UT","WA","SC","TX","MD","FL"].includes(st)) return 24;
    return 26; // big alphabetical group + MO
  };
  for (const st of ALL_STATES) {
    const notAvail = sa.not_available.includes(st);
    const bonus = (sa.bonus_overrides?.[st] as number | undefined) ?? cfg.bonus.percentage;
    const sched = (sa.surrender_overrides?.[st] as number[] | undefined) ?? cfg.surrender.schedule;
    const exp = expectBonus(st);
    if (notAvail) { if (!Number.isNaN(exp)) flag(`${st}: marked not-available but expected available`); continue; }
    if (bonus !== exp) flag(`${st}: bonus resolved ${bonus}% but expected ${exp}%`);
    if (sched.length !== cfg.surrender.years) flag(`${st}: surrender schedule length ${sched.length} != surrender.years ${cfg.surrender.years}`);
    if (sched.some((v) => v < 0 || v > 100)) flag(`${st}: surrender schedule out of range`);
  }
  // not-available list correctness
  for (const st of sa.not_available) if (!["GU","NY","PR","VI"].includes(st)) flag(`not_available includes unexpected ${st}`);
  console.log(`  base bonus=${cfg.bonus.percentage}%  CA=${sa.bonus_overrides?.CA}%  24%-states=${Object.entries(sa.bonus_overrides ?? {}).filter(([,v])=>v===24).length}  not-avail=[${sa.not_available.join(",")}]`);
  console.log(`  Part 1 issues: ${problems}`);
  console.log();

  // ---- PART 2: ENGINE SANITY across profiles ----------------------------
  console.log("=== PART 2: full-strategy engine sanity across profiles ===");
  const base = {
    custom_product_id: PRODUCT_ID, blueprint_type: "vesting-bonus-growth",
    surrender_years: 10, surrender_schedule: cfg.surrender.schedule,
    ss_self: 0, ssi_annual_amount: 0, tax_payment_source: "from_taxable",
    conversion_type: "optimized_amount", respect_penalty_free_limit: true, penalty_free_percent: 10,
  };
  // state→bonus resolver for building realistic clients
  const bonusFor = (st: string) => (sa.bonus_overrides?.[st] as number | undefined) ?? cfg.bonus.percentage;

  type Profile = { label: string; c: Partial<Client> };
  const profiles: Profile[] = [
    { label: "CA 62 single $500k @6.5%", c: { age: 62, date_of_birth: "1964-01-01", filing_status: "single", state: "CA", qualified_account_value: 50_000_000, bonus_percent: bonusFor("CA"), rate_of_return: 6.5, end_age: 95, projection_years: 33 } },
    { label: "GA 68 MFJ $1.2M @7% (spouse 66)", c: { age: 68, date_of_birth: "1958-01-01", filing_status: "married_filing_jointly", spouse_age: 66, state: "GA", qualified_account_value: 120_000_000, bonus_percent: bonusFor("GA"), rate_of_return: 7, end_age: 92, projection_years: 24, ss_self: 4_000_000, ssi_annual_amount: 4_000_000 } },
    { label: "TX 71 single $300k @6%", c: { age: 71, date_of_birth: "1955-01-01", filing_status: "single", state: "TX", qualified_account_value: 30_000_000, bonus_percent: bonusFor("TX"), rate_of_return: 6, end_age: 95, projection_years: 24 } },
    { label: "FL 75 single $250k @5% (just before RMD)", c: { age: 75, date_of_birth: "1951-01-01", filing_status: "single", state: "FL", qualified_account_value: 25_000_000, bonus_percent: bonusFor("FL"), rate_of_return: 5, end_age: 95, projection_years: 20 } },
    { label: "EDGE: 0% credited (principal protection?)", c: { age: 60, date_of_birth: "1966-01-01", filing_status: "single", state: "CA", qualified_account_value: 40_000_000, bonus_percent: 20, rate_of_return: 0, end_age: 90, projection_years: 30 } },
    { label: "EDGE: tiny $25k balance @7%", c: { age: 60, date_of_birth: "1966-01-01", filing_status: "single", state: "AL", qualified_account_value: 2_500_000, bonus_percent: 26, rate_of_return: 7, end_age: 90, projection_years: 30 } },
    { label: "EDGE: very high 12% rate $1M", c: { age: 60, date_of_birth: "1966-01-01", filing_status: "single", state: "AL", qualified_account_value: 100_000_000, bonus_percent: 26, rate_of_return: 12, end_age: 90, projection_years: 30 } },
    { label: "EDGE: age 79 single $400k (past surrender start)", c: { age: 79, date_of_birth: "1947-01-01", filing_status: "single", state: "CA", qualified_account_value: 40_000_000, bonus_percent: 20, rate_of_return: 6, end_age: 95, projection_years: 16 } },
    { label: "EDGE: from_ira taxes, respect cap, CA 63 $800k", c: { age: 63, date_of_birth: "1963-01-01", filing_status: "single", state: "CA", qualified_account_value: 80_000_000, bonus_percent: 20, rate_of_return: 6.5, end_age: 95, projection_years: 32, tax_payment_source: "from_ira" } },
  ];

  const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
  for (const { label, c } of profiles) {
    const client = { ...base, ...c, baseline_comparison_rate: c.rate_of_return } as unknown as Client;
    let res;
    try { res = runGrowthSimulation(createSimulationInput(client, product)); }
    catch (e: any) { flag(`${label}: THREW ${e.message}`); continue; }
    const { baseline, formula, breakEvenAge, totalTaxSavings, heirBenefit } = res;
    const last = formula[formula.length - 1];
    const lastBase = baseline[baseline.length - 1];
    const y1 = formula[0];
    // Total WEALTH = trad+roth+taxable (RMD/conversion-invariant for from_taxable).
    const total = (y: any) => y.traditionalBalance + y.rothBalance + (y.taxableBalance ?? 0);
    // Assertions
    const issues: string[] = [];
    for (const y of formula) {
      if (![y.traditionalBalance, y.rothBalance, y.taxableBalance, y.totalTax, y.netWorth].every(finite)) { issues.push(`non-finite year value age ${y.age}`); break; }
      if (y.traditionalBalance < -1 || y.rothBalance < -1 || y.taxableBalance < -1) { issues.push(`negative balance age ${y.age}`); break; }
      if (y.netWorth < -1) { issues.push(`negative netWorth age ${y.age}`); break; }
    }
    if (!finite(totalTaxSavings)) issues.push("totalTaxSavings non-finite");
    if (!finite(heirBenefit)) issues.push("heirBenefit non-finite");
    // Bonus check: year-1 END total = bonused premium grown one year, with rider
    // (0.95%) biting only the slice NOT yet converted to Roth. So it lands in
    // [ bonused·(1+rate)·(1-rider) , bonused·(1+rate) ], plus rounding tolerance.
    const premium = (c.qualified_account_value ?? 0);
    const bonusPct = (c.bonus_percent ?? 0) / 100;
    const rate = (c.rate_of_return ?? 0) / 100;
    const bonused = premium * (1 + bonusPct);
    const grown = bonused * (1 + rate);
    // Total WEALTH (incl. taxable) lands at ~grown; ceiling tight (catches double-
    // bonus / double-growth). Floor 0.88 catches a MISSING bonus (a dropped 20%
    // bonus → 0.83·grown) while tolerating year-1 RMD draws & from-IRA tax payment.
    const upper = grown * 1.005;
    const lower = grown * 0.88;
    if (total(y1) > upper) issues.push(`y1 wealth ${usd(total(y1))} exceeds grown-bonused ceiling ${usd(upper)} (double bonus/growth?)`);
    if (total(y1) < lower) issues.push(`y1 wealth ${usd(total(y1))} below floor ${usd(lower)} (bonus not applied?)`);
    // Strategy should never destroy total wealth vs baseline by a wild margin at
    // the same rate (sanity, not a strict winner check).
    if (last.netWorth < lastBase.netWorth * 0.5) issues.push(`strat netWorth ${usd(last.netWorth)} < half of baseline ${usd(lastBase.netWorth)}`);
    issues.forEach((i) => flag(`${label}: ${i}`));
    const ok = issues.length === 0 ? "ok" : "SEE ABOVE";
    console.log(`  ${label}`);
    console.log(`     y1 wealth=${usd(total(y1))} (grown-bonused ${usd(grown)}) | strat netWorth=${usd(last.netWorth)} (trad/roth/tax ${usd(last.traditionalBalance)}/${usd(last.rothBalance)}/${usd(last.taxableBalance)}) | base netWorth=${usd(lastBase.netWorth)} | breakeven=${breakEvenAge ?? "—"} | taxSav=${usd(totalTaxSavings)} | heir=${usd(heirBenefit)} [${ok}]`);
  }
  console.log();
  console.log(problems === 0 ? "✅ AUDIT CLEAN — no problems found." : `❌ AUDIT FOUND ${problems} problem(s) — see ⚠️ lines above.`);
  process.exit(problems === 0 ? 0 : 1);
})();
