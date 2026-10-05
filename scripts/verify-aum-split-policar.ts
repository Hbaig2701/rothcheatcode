/**
 * Verifies Greg's scenario: client has $3,000,000 in a Traditional IRA but only
 * wants $1,000,000 going into the Athene annuity (the other $2M stays put).
 *
 * Reproduces the EXACT projections-route code path (buildRothSideClient +
 * full-balance baseline + runAumScenario) using Dr. Policar's real product
 * (vesting-bonus-growth, 19% bonus). Confirms the AUM-split approach:
 *   1. Annuity premium + bonus land on the $1M slice (NOT the full $3M)
 *   2. The "do nothing" baseline runs on the FULL $3M (apples-to-apples)
 *   3. The $2M remainder is tracked in its own bucket
 *
 * Usage: npx tsx scripts/verify-aum-split-policar.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { runGrowthSimulation, createSimulationInput, runAumScenario } from "../lib/calculations";
import type { Client } from "../lib/types/client";
import type { CustomProductRow } from "../lib/products/types";

config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const PRODUCT_ID = "2da79cb5-85b2-478a-bb06-7201c0e29128"; // Policar's product
const usd = (c: number) => "$" + Math.round(c / 100).toLocaleString();

// Replica of route.ts buildRothSideClient
function buildRothSideClient(client: Client): Client {
  const pct = client.aum_allocation_percent ?? 0;
  if (pct <= 0) return client;
  const reduced = Math.round((client.qualified_account_value ?? 0) * (1 - pct / 100));
  return { ...client, qualified_account_value: reduced };
}

(async () => {
  const { data: p } = await admin.from("custom_products").select("*").eq("id", PRODUCT_ID).single();
  const product = p as CustomProductRow;

  // Greg's scenario. $1M of $3M into the annuity → annuity = 33.333%, AUM = 66.667%.
  const AUM_PCT = 66.6667;
  const base: Client = {
    name: "Greg test (3M IRA, 1M to annuity)", age: 75, date_of_birth: "1951-01-01",
    filing_status: "married_filing_jointly", state: "CA",
    qualified_account_value: 300_000_000, // $3,000,000 in CENTS
    taxable_accounts: 0,
    custom_product_id: PRODUCT_ID, blueprint_type: "vesting-bonus-growth",
    rate_of_return: 6, guaranteed_rate_of_return: 0, baseline_comparison_rate: 6,
    bonus_percent: 19, tax_payment_source: "from_ira",
    conversion_type: "full", end_age: 95, projection_years: 20,
    payout_type: "individual", ss_self: 4_200_000,
    aum_allocation_percent: AUM_PCT, aum_growth_rate: 6, aum_fee_percent: 1,
    rmds_handled_externally: false,
  } as unknown as Client;

  console.log(`SCENARIO: ${usd(base.qualified_account_value!)} total IRA, AUM split ${AUM_PCT}% → annuity slice ${usd(Math.round(base.qualified_account_value! * (1 - AUM_PCT/100)))}\n`);
  console.log(`Product: "${product.name}"  bonus=${base.bonus_percent}%  return=${base.rate_of_return}%\n`);

  // ---- Reproduce the route's Growth-FIA split path ----
  const rothSideClient = buildRothSideClient(base);
  const splitResult = runGrowthSimulation(createSimulationInput(rothSideClient, product));
  const baselineFull = runGrowthSimulation(createSimulationInput(base, product)).baseline;

  const startingIraPortion = Math.round((base.qualified_account_value ?? 0) * (AUM_PCT / 100));
  const startYear = splitResult.formula[0]?.year ?? 2026;
  const aumYears = runAumScenario({ startingIraPortion, client: base, startYear, projectionYears: splitResult.formula.length, iraShortfallByYear: new Map() });

  let problems = 0;
  const f0 = splitResult.formula[0];
  const fLast = splitResult.formula[splitResult.formula.length - 1];
  const bLast = baselineFull[baselineFull.length - 1];
  const aLast = aumYears[aumYears.length - 1];

  // ---- CHECK 1: annuity premium + bonus on the $1M slice ----
  console.log("=== CHECK 1: Annuity premium & bonus on the $1M slice ===");
  console.log(`  roth-side qualified value handed to engine = ${usd(rothSideClient.qualified_account_value!)}   (expect ~$1,000,000)`);
  const expectedPremium = Math.round(rothSideClient.qualified_account_value! * 1.19);
  console.log(`  year-1 strategy IRA balance (premium incl. 19% bonus) = ${usd(f0.traditionalBalance)}`);
  console.log(`  productBonusApplied = ${usd(f0.productBonusApplied ?? 0)}   (expect ~${usd(Math.round(rothSideClient.qualified_account_value! * 0.19))})`);
  if (Math.abs((f0.productBonusApplied ?? 0) - Math.round(rothSideClient.qualified_account_value! * 0.19)) > 100_00) {
    console.log("  ✗ bonus is NOT ~19% of the $1M slice"); problems++;
  }
  // The bonus must NOT be on $3M.
  if ((f0.productBonusApplied ?? 0) > Math.round(2_000_000_00 * 0.19)) {
    console.log("  ✗ BUG: bonus appears to be applied to far more than the $1M slice"); problems++;
  }
  console.log();

  // ---- CHECK 2: baseline runs on the FULL $3M ----
  console.log("=== CHECK 2: 'Do nothing' baseline on the FULL $3M ===");
  const b0 = baselineFull[0];
  console.log(`  baseline year-1 traditional balance = ${usd(b0.traditionalBalance)}   (expect ~$3,000,000 + 1yr growth, NO bonus)`);
  if (b0.traditionalBalance < 280_000_000) { console.log("  ✗ baseline does not start near $3M"); problems++; }
  if (b0.traditionalBalance > 330_000_000) { console.log("  ✗ baseline looks like it got a bonus (too high)"); problems++; }
  console.log(`  baseline final net worth (age ${bLast.age}) = ${usd(bLast.netWorth)}`);
  console.log();

  // ---- CHECK 3: the $2M remainder is tracked ----
  console.log("=== CHECK 3: The $2M remainder tracked in its own bucket ===");
  console.log(`  AUM starting IRA portion = ${usd(startingIraPortion)}   (expect ~$2,000,000)`);
  console.log(`  AUM bucket final balance (age ${aLast.age}) = ${usd(aLast.taxableBalance)}`);
  if (startingIraPortion < 195_000_000 || startingIraPortion > 205_000_000) { console.log("  ✗ AUM slice is not ~$2M"); problems++; }
  if (aLast.taxableBalance <= 0) { console.log("  ✗ BUG: $2M remainder vanished (final AUM balance is $0)"); problems++; }
  console.log();

  // ---- Combined picture ----
  console.log("=== COMBINED STRATEGY vs BASELINE (final, age " + fLast.age + ") ===");
  const combinedStrategyNW = fLast.netWorth + aLast.netWorth;
  console.log(`  Strategy (annuity $1M + AUM $2M) final net worth = ${usd(combinedStrategyNW)}`);
  console.log(`  Baseline (do-nothing full $3M)  final net worth = ${usd(bLast.netWorth)}`);
  console.log(`  Roth-side annuity alone          final net worth = ${usd(fLast.netWorth)}`);
  console.log(`  AUM-side ($2M) alone             final net worth = ${usd(aLast.netWorth)}`);

  // Sanity: the annuity-alone slice should be smaller than the full baseline,
  // and the COMBINED (annuity+AUM) is the honest comparison.
  console.log();
  console.log(problems === 0
    ? "✅ PASS — AUM-split models Greg's $3M→$1M correctly: bonus on $1M, baseline on $3M, $2M tracked."
    : `❌ ${problems} problem(s) — review above.`);
  process.exit(problems === 0 ? 0 : 1);
})();
