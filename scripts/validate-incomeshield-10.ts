/**
 * Validates the American Equity IncomeShield 10 (10% Rollup LIBR) community
 * product against the carrier illustration (Jeff & Gay Forsberg — joint, income
 * activation age 66, 10% simple roll-up, 1.20% rider fee, Tax Type: IRA-Roth).
 *
 * The illustration's premium is ALREADY Roth ("Tax Type: IRA-Roth", 4× $180k
 * flexible premiums = $720k). To reproduce it we feed the annuity already-Roth
 * money (roth_ira) with no conversion phase — the illustration assumes no
 * conversion tax. A single $660k Roth premium reproduces the guaranteed benefit
 * base + income to the dollar:
 *   base @ age 66 = 660,000 × (1 + 0.10 × 8 yrs) = $1,188,000  (illustration exact)
 *   income        = $1,188,000 × 6.69% (joint @66)  = $79,477   (illustration exact)
 *
 * NOTE on the Traditional-IRA use case: if instead a client CONVERTS a
 * Traditional IRA to fund the annuity, the platform correctly (a) pays conversion
 * tax first (annuity is funded with the after-tax amount) and (b) spends year 1
 * converting, so the annuity gets 7 roll-up years instead of 8. That yields a
 * lower income than this illustration — which is correct for that scenario, since
 * the illustration's money was already Roth.
 *
 * Usage: npx tsx scripts/validate-incomeshield-10.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { runGuaranteedIncomeSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
import type { CustomProductRow } from "../lib/products/types";

config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const PRODUCT_NAME = "American Equity IncomeShield 10 (10% Rollup LIBR)";
const usd = (c: number) => "$" + Math.round(c / 100).toLocaleString();

// Already-Roth premium (matches the illustration's Tax Type: IRA-Roth): no
// conversion phase, annuity buys at issue age with the full premium.
function forsberg(rate: number, incomeAge: number, rothDollars: number): Client {
  return {
    name: "Forsberg (IncomeShield test)", age: 58, date_of_birth: "1968-01-01",
    filing_status: "married_filing_jointly", state: "ID",
    qualified_account_value: 0, roth_ira: Math.round(rothDollars * 100), // already Roth
    custom_product_id: "inline", blueprint_type: "simple-rollup-income",
    rate_of_return: rate, guaranteed_rate_of_return: rate,
    payout_type: "joint", payout_option: "level", roll_up_option: null,
    conversion_type: "no_conversion", gi_conversion_years: 0,
    end_age: 105, projection_years: 47, ss_self: 0, ssi_annual_amount: 0,
    bonus_percent: 0, tax_payment_source: "from_taxable",
    income_start_age: incomeAge,
  } as unknown as Client;
}
const metrics = (product: CustomProductRow, rate: number, incomeAge: number, roth: number) =>
  runGuaranteedIncomeSimulation(createSimulationInput(forsberg(rate, incomeAge, roth), product)).giMetrics;

(async () => {
  const { data: p, error } = await admin.from("community_products").select("*").eq("name", PRODUCT_NAME).single();
  if (error || !p) { console.error("Product not found:", error?.message); process.exit(1); }
  const product = p as unknown as CustomProductRow;
  const inc = product.config.income!;
  console.log(`Product: "${product.name}"`);
  console.log(`  engine=${product.engine_preset}  roll-up=${inc.roll_up_rate}% ${inc.roll_up_type}/${inc.roll_up_max_years}yr  fee=${product.config.fees.annual_rider_fee}%  bonus=${product.config.bonus.percentage}%`);
  console.log(`  payout joint@66=${inc.payout_factors.joint["66"]}%  @65=${inc.payout_factors.joint["65"]}%\n`);

  let all = true;
  const PASS = (label: string, got: number, want: number, tolPct = 0.2) => {
    const d = want !== 0 ? Math.abs(got - want) / want * 100 : (got === 0 ? 0 : 100);
    const ok = d <= tolPct; all = ok && all;
    console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}: got ${usd(got)}  want ${usd(want)}  (Δ ${d.toFixed(2)}%)`);
  };

  console.log("=== (A) GUARANTEED (0%), $660k already-Roth, income @66 — reproduce the illustration ===");
  const g = metrics(product, 0, 66, 660_000);
  PASS("benefit base @ income age", g.incomeBaseAtIncomeAge, 118_800_000); // $1,188,000
  PASS("annual income (gross)", g.annualIncomeGross, 7_947_700);           // $79,477
  console.log();

  console.log("=== (B) payout-factor spot checks (implied % = income / base) ===");
  const wantPct: Record<number, number> = { 63: 6.29, 65: 6.64, 68: 7.16, 70: 7.69, 71: 8.13 };
  for (const age of [63, 65, 68, 70, 71]) {
    const m = metrics(product, 0, age, 660_000);
    const impl = m.incomeBaseAtIncomeAge > 0 ? (m.annualIncomeGross / m.incomeBaseAtIncomeAge) * 100 : 0;
    const ok = Math.abs(impl - wantPct[age]) <= 0.03; all = ok && all;
    console.log(`  [${ok ? "PASS" : "FAIL"}] age ${age}: implied ${impl.toFixed(2)}%  want ${wantPct[age]}%`);
  }
  console.log();

  console.log("=== (C) 10% simple roll-up: base = premium × (1 + 0.10 × min(yrs,10)) ===");
  // income @66 → 8 roll-up yrs → 1.8×; income @76 → capped at 10 yrs → 2.0×
  PASS("base @66 (8 yrs → 1.8×)", metrics(product, 0, 66, 500_000).incomeBaseAtIncomeAge, 90_000_000);   // 500k×1.8
  PASS("base @76 (cap 10 yrs → 2.0×)", metrics(product, 0, 76, 500_000).incomeBaseAtIncomeAge, 100_000_000); // 500k×2.0
  console.log();

  console.log("=== (D) rider fee 1.20% is on the CONTRACT VALUE, not the income base (base rolls at full 10%) ===");
  const fee = metrics(product, 0, 66, 660_000);
  const feeOnBaseOk = fee.incomeBaseAtIncomeAge === 118_800_000; all = feeOnBaseOk && all;
  console.log(`  [${feeOnBaseOk ? "PASS" : "FAIL"}] income base unaffected by rider fee (still $1,188,000); totalRiderFees=${usd(fee.totalRiderFees)}`);
  console.log();

  console.log(all ? "✅ ALL CHECKS PASS — product reproduces the illustration to the dollar" : "❌ SOME CHECKS FAILED");
  process.exit(all ? 0 : 1);
})();
