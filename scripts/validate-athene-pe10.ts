/**
 * Validates the Athene Performance Elite 10 Plus build against the carrier
 * illustration (Karen Gervasoni: CA, age 55, $300,000 Traditional IRA, 20%
 * premium bonus). Runs the GROWTH engine and checks the product mechanics:
 *
 *   (A) 20% premium bonus → initial accumulation value ≈ $360,000.
 *   (B) Guaranteed (0% credited) → value erodes by the 0.95% rider fee over the
 *       10-yr rider period, plateauing ≈ $327,226 (illustration's Guaranteed col).
 *   (C) Current rates (8.35% effective) → endpoint ballpark vs illustration's
 *       $8.44M at age 95 (methodology differs: our engine runs the Roth-
 *       conversion strategy, the illustration is pure accumulation — total
 *       wealth (traditional+roth) is the conversion-invariant comparison).
 *
 * Usage: npx tsx scripts/validate-athene-pe10.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
import type { CustomProductRow } from "../lib/products/types";

config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const PRODUCT_ID = "8d7d7da3-1692-41c2-968d-4d71ef64e394"; // Hamza's master copy
const usd = (c: number) => "$" + Math.round(c / 100).toLocaleString();

// Mirrors the Karen illustration. bonus_percent=20 is what the CA override
// auto-fills on the new-account form (state_availability.bonus_overrides.CA).
function karen(rate: number): Client {
  return {
    name: "Karen (PE10 test)", age: 55, date_of_birth: "1971-01-01",
    filing_status: "single", state: "CA",
    qualified_account_value: 30_000_000, // $300,000 in CENTS
    custom_product_id: PRODUCT_ID, blueprint_type: "vesting-bonus-growth",
    rate_of_return: rate, baseline_comparison_rate: rate, post_contract_rate: rate,
    bonus_percent: 20, surrender_years: 10,
    surrender_schedule: [8.2, 7.7, 6.6, 5.6, 4.5, 3.4, 2.3, 1.2, 0.1, 0],
    end_age: 96, projection_years: 41,
    ss_self: 0, ssi_annual_amount: 0,
    tax_payment_source: "from_taxable",
    // no_conversion isolates the PURE ANNUITY ACCUMULATION (bonus + rider fee +
    // growth) so it's apples-to-apples with the carrier illustration's columns.
    // (The default optimized strategy converts the annuity → Roth, which escapes
    //  the rider fee — correct app behavior, but not comparable to the carrier's
    //  pure-accumulation table.)
    conversion_type: "no_conversion",
  } as unknown as Client;
}

function run(product: CustomProductRow, rate: number) {
  const { formula } = runGrowthSimulation(createSimulationInput(karen(rate), product));
  const total = (y: { traditionalBalance: number; rothBalance: number }) => y.traditionalBalance + y.rothBalance;
  const at = (age: number) => formula.find((y) => y.age === age);
  return { formula, total, at };
}

(async () => {
  const { data: p } = await admin.from("custom_products").select("*").eq("id", PRODUCT_ID).single();
  const product = p as CustomProductRow;
  console.log(`Product: "${product.name}"  preset=${product.engine_preset}  riderFee=${product.config.fees.annual_rider_fee}%  bonus(base)=${product.config.bonus.percentage}%  CA=${product.config.state_availability?.bonus_overrides?.CA}%`);
  console.log();

  // (A) + (B): guaranteed 0% credited
  {
    const { formula, total, at } = run(product, 0);
    const y1 = formula[0];
    console.log("=== (A) 20% bonus → initial accumulation value ===");
    console.log(`  Year 1 total (traditional+roth) = ${usd(total(y1))}   (illustration BOY contract value = $360,000)`);
    console.log();
    console.log("=== (B) Guaranteed (0% credited) — 0.95% rider fee erodes for 10 yrs ===");
    [56, 60, 64, 65, 75, 95].forEach((age) => {
      const y = at(age); if (y) console.log(`  age ${age}: ${usd(total(y))}`);
    });
    console.log(`  illustration Guaranteed plateau (yr 11+, age 65+) = $327,226`);
  }
  console.log();

  // (C): current-rates effective 8.35%
  {
    const { total, at } = run(product, 8.35);
    console.log("=== (C) Current rates (8.35% effective) — total wealth trajectory ===");
    [56, 65, 75, 85, 95].forEach((age) => {
      const y = at(age); if (y) console.log(`  age ${age}: ${usd(total(y))}`);
    });
    console.log(`  illustration Current-rates ending value (age 95) = $8,440,347`);
  }
  console.log();

  // Default-rate (6.5%) sanity — what an advisor sees out of the box
  {
    const { total, at } = run(product, 6.5);
    const y95 = at(95);
    console.log("=== Out-of-box default (6.5%) ===");
    console.log(`  age 95 total wealth = ${y95 ? usd(total(y95)) : "n/a"}`);
  }
  process.exit(0);
})();
