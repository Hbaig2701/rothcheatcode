/**
 * Validates the roll_up_credit_basis fix for Athene Agility 10.
 *
 * Carrier mechanic (illustration p.9): the benefit base grows by "200% of the
 * DOLLARS credited to the Accumulated Value" — i.e. base += multiple × rate × AV
 * (pattern B), NOT base × (1 + multiple×rate) (pattern A, the old approximation).
 *
 * This runs the Agility product BOTH ways (pattern A = as-seeded today / no
 * basis; pattern B = roll_up_credit_basis 'account_value') WITHOUT mutating the
 * DB, and checks:
 *   (A) 0% guaranteed → income base $465,000, income $23,250 (illustration exact)
 *       — must hold for both patterns (0 roll-up either way).
 *   (B) pattern B internal consistency: each year, BB_next == BB + 2×rate×AV_boy
 *       using the engine's own reported account value.
 *   (C) magnitude of the correction: pattern A vs B income base at a positive rate.
 *
 * Usage: npx tsx scripts/validate-agility-rollup-basis.ts
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

function karen(rate: number): Client {
  return {
    name: "Karen (Agility test)", age: 55, date_of_birth: "1971-01-01",
    filing_status: "single", state: "CA",
    qualified_account_value: 30_000_000, // $300,000 in CENTS
    custom_product_id: PRODUCT_ID, blueprint_type: "flat-rate-compound-income",
    rate_of_return: rate, guaranteed_rate_of_return: rate,
    payout_type: "individual", payout_option: "level", roll_up_option: null,
    end_age: 105, projection_years: 45, ss_self: 0, ssi_annual_amount: 0,
    bonus_percent: 55, tax_payment_source: "from_taxable",
    gi_conversion_years: 1, income_start_age: 65,
  } as unknown as Client;
}

// Clone a product with a forced roll_up_credit_basis (in-memory only).
function withBasis(p: CustomProductRow, basis: "income_base" | "account_value"): CustomProductRow {
  return { ...p, config: { ...p.config, income: { ...p.config.income!, roll_up_credit_basis: basis } } };
}

(async () => {
  const { data } = await admin.from("custom_products").select("*").eq("id", PRODUCT_ID).single();
  const base = data as CustomProductRow;
  const mult = base.config.income!.roll_up_interest_multiple!;
  const patA = withBasis(base, "income_base");
  const patB = withBasis(base, "account_value");
  console.log(`Product "${base.name}"  multiple=${mult}×  bonus=${base.config.bonus.percentage}%\n`);

  // The illustration is a PURE TRADITIONAL ANNUITY (no Roth conversion) — that's
  // the engine's BASELINE scenario. The strategy converts first and its
  // conversion tax reduces the purchase amount, so it can't match the carrier's
  // pre-conversion benefit base. Validate the mechanic on the baseline.
  const run = (p: CustomProductRow, rate: number) => {
    const m = runGuaranteedIncomeSimulation(createSimulationInput(karen(rate), p)).giMetrics;
    return { base: m.comparison.baselineIncomeBase, yearly: m.baselineYearlyData };
  };

  console.log("=== (A) 0% guaranteed anchor — BASELINE (illustration: base $465,000) ===");
  for (const [label, p] of [["pattern A", patA], ["pattern B", patB]] as const) {
    console.log(`  ${label}: baseline income base ${usd(run(p, 0).base)}`);
  }

  console.log("\n=== (B) pattern B internal consistency @ 5% (BB_next == BB + 2×rate×AV_boy) ===");
  const rate = 0.05;
  const defs = run(patB, 5).yearly.filter((y) => y.phase === "purchase" || y.phase === "deferral");
  let prevBase: number | null = null, prevAV: number | null = null, maxErr = 0;
  for (const y of defs) {
    if (prevBase != null && prevAV != null) {
      const expected = prevBase + Math.round(mult * rate * prevAV);
      const err = Math.abs(expected - y.incomeBase);
      maxErr = Math.max(maxErr, err);
      console.log(`  age ${y.age}: AV_boy ${usd(prevAV)} → base ${usd(y.incomeBase)} (expected ${usd(expected)}, Δ ${usd(err)})`);
    } else {
      console.log(`  age ${y.age}: base ${usd(y.incomeBase)} (start)`);
    }
    prevBase = y.incomeBase; prevAV = y.accountValue;
  }
  console.log(`  → max per-year error: ${usd(maxErr)} ${maxErr <= 100 ? "✅ consistent" : "❌ MISMATCH"}`);

  console.log("\n=== (C) correction magnitude: pattern A vs B baseline income base ===");
  for (const r of [5.25, 8]) {
    const a = run(patA, r).base, b = run(patB, r).base;
    console.log(`  @${r}% → A ${usd(a)} | B ${usd(b)} | A overstates by ${(((a - b) / b) * 100).toFixed(1)}%`);
  }
  process.exit(0);
})();
