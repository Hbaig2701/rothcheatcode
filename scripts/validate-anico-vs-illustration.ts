/**
 * Validate our growth engine against the ANICO Strategy Indexed Annuity PLUS 10
 * illustration for Roger Helou.
 *
 * Pulls the seeded client + custom product from the DB, runs the growth
 * simulation in two modes:
 *   1. "Pure accumulation" — conversion_type=no_conversion, no withdrawals.
 *      This is the apples-to-apples match for the illustration's
 *      non-guaranteed Annuity Value column (pages 9-10).
 *   2. "As configured" — optimized conversions, the realistic projection.
 *
 * Usage:
 *   npx tsx scripts/validate-anico-vs-illustration.ts <email>
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import {
  runGrowthSimulation,
  createSimulationInput,
} from "../lib/calculations";
import type { Client } from "../lib/types/client";
import type { CustomProductRow } from "../lib/products/types";

config({ path: resolve(process.cwd(), ".env.local") });

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx scripts/validate-anico-vs-illustration.ts <email>");
  process.exit(1);
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Illustration's non-guaranteed Annuity Value column (pages 9-10) —
// these are the ground-truth numbers we want to match.
const ILLUSTRATION_NON_GUARANTEED: Record<number, number> = {
  1: 2_483_234, 2: 2_844_224, 3: 2_865_369, 4: 3_261_350, 5: 3_615_736,
  6: 3_772_934, 7: 3_809_116, 8: 3_994_025, 9: 4_242_914, 10: 4_583_304,
  11: 4_959_417, 12: 5_712_213, 13: 5_748_242, 14: 6_602_108, 15: 7_353_837,
  20: 9_414_824, 25: 15_389_980, 30: 19_904_866,
};

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

(async () => {
  // Look up user
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const user = list!.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`No user: ${email}`);
    process.exit(1);
  }

  // Pull the seeded product
  const { data: product, error: prodErr } = await admin
    .from("custom_products")
    .select("*")
    .eq("user_id", user.id)
    .eq("name", "ANICO Strategy Indexed Annuity PLUS 10")
    .maybeSingle();
  if (prodErr || !product) {
    console.error("Product missing:", prodErr?.message);
    process.exit(1);
  }

  // Pull the seeded client
  const { data: clientRow, error: clientErr } = await admin
    .from("clients")
    .select("*")
    .eq("user_id", user.id)
    .eq("name", "Roger Helou (test mirror)")
    .maybeSingle();
  if (clientErr || !clientRow) {
    console.error("Client missing:", clientErr?.message);
    process.exit(1);
  }

  // Build the simulation input — engine expects Client + CustomProductRow
  // Apply the same product overlay the form does (mirrors applyCustomProduct in new-account.tsx)
  const cfg = (product as CustomProductRow).config;
  const baseClient: Client = {
    ...(clientRow as unknown as Client),
    blueprint_type: (product as CustomProductRow).engine_preset as Client["blueprint_type"],
    bonus_percent: cfg.bonus.percentage,
    surrender_years: cfg.surrender.years,
    surrender_schedule: cfg.surrender.schedule.length ? cfg.surrender.schedule : null,
    penalty_free_percent: cfg.withdrawals.penalty_free_percent,
    rate_of_return: cfg.form_defaults?.rate_of_return ?? 7,
  };

  // -- Mode 0: pure FIA growth test — lie about age so RMDs never trigger,
  // disable SS and other income so taxes don't interfere. Same product,
  // same premium, same rate. Tests ONLY the engine's growth math vs the
  // illustration's accumulation curve.
  const pureGrowthClient: Client = {
    ...baseClient,
    age: 40, // way below RMD age
    spouse_age: 38,
    end_age: 65, // 25-year projection, all pre-RMD
    conversion_type: "no_conversion",
    withdrawals: [],
    withdrawal_type: "no_withdrawals",
    rmd_treatment: "reinvested",
    ssi_payout_age: 67,
    spouse_ssi_payout_age: 67,
    ssi_annual_amount: 0,
    spouse_ssi_annual_amount: 0,
    ss_self: 0,
    ss_spouse: 0,
    taxable_accounts: 0,
    roth_ira: 0,
    non_ssi_income: [],
    projection_years: 25,
  };
  const pureGrowthInput = createSimulationInput(pureGrowthClient, product as CustomProductRow);
  const pureGrowthResult = runGrowthSimulation(pureGrowthInput);

  console.log("\n=== Mode 0: PURE GROWTH TEST (age 40, no RMDs, no SS, no withdrawals) ===");
  console.log("Isolates the engine's growth math. Should match the illustration if 7% + 1% bonus are right.\n");
  console.log("Year | Illustration   | Engine          | Δ           | % drift");
  console.log("-".repeat(65));
  for (const [yearStr, illustration] of Object.entries(ILLUSTRATION_NON_GUARANTEED)) {
    const year = parseInt(yearStr);
    const idx = year - 1;
    if (idx >= pureGrowthResult.formula.length) continue;
    const row = pureGrowthResult.formula[idx];
    const engineTotal = ((row.traditionalBalance ?? 0) + (row.rothBalance ?? 0)) / 100;
    const diff = engineTotal - illustration;
    const drift = diff / illustration;
    console.log(
      `${String(year).padStart(4)} | ${fmt(illustration).padStart(14)} | ${fmt(engineTotal).padStart(15)} | ` +
      `${(diff >= 0 ? "+" : "") + fmt(diff).padStart(10)} | ${pct(drift).padStart(7)}`
    );
  }

  // -- Mode 1: pure accumulation as realistic (RMDs ON), no conversions
  const pureAccumClient: Client = {
    ...baseClient,
    conversion_type: "no_conversion",
    withdrawals: [],
    withdrawal_type: "no_withdrawals",
    rmd_treatment: "reinvested",
  };

  const pureInput = createSimulationInput(pureAccumClient, product as CustomProductRow);
  const pureResult = runGrowthSimulation(pureInput);

  console.log("\n=== Mode 1: Pure FIA accumulation (no conversions, no withdrawals) ===");
  console.log("Compares engine TOTAL ASSETS (trad+roth+taxable) vs illustration's Annuity Value.");
  console.log("The illustration assumes no RMDs are taken. The engine MUST take RMDs from age 73");
  console.log("on, and reinvests proceeds into the taxable account. Net total should match if the");
  console.log("reinvested taxable account grows at the same rate.\n");
  console.log("Year | Age | Illust (FIA only) | Engine (Trad+Roth) | Engine (+Taxable) | Δ-total | % drift");
  console.log("-".repeat(105));

  const taxableInitialDollars = (pureAccumClient.taxable_accounts ?? 0) / 100;
  for (const [yearStr, illustration] of Object.entries(ILLUSTRATION_NON_GUARANTEED)) {
    const year = parseInt(yearStr);
    const idx = year - 1;
    if (idx >= pureResult.formula.length) continue;
    const row = pureResult.formula[idx];
    const trad = (row.traditionalBalance ?? 0) / 100;
    const roth = (row.rothBalance ?? 0) / 100;
    const taxable = (row.taxableBalance ?? 0) / 100;
    // Subtract Roger's STARTING taxable ($309K initial brokerage) so we're
    // comparing apples-to-apples: only the FIA-side accumulation, not his
    // pre-existing brokerage. Then add RMD outflows reinvested in taxable
    // back to the FIA side. (Initial brokerage compounds separately.)
    const taxableFromRMDs = Math.max(0, taxable - taxableInitialDollars);
    const engineFIAEquivalent = trad + roth + taxableFromRMDs;
    const diff = engineFIAEquivalent - illustration;
    const drift = diff / illustration;
    console.log(
      `${String(year).padStart(4)} | ${String(70 + year).padStart(3)} | ` +
      `${fmt(illustration).padStart(17)} | ${fmt(trad + roth).padStart(18)} | ` +
      `${fmt(engineFIAEquivalent).padStart(17)} | ` +
      `${(diff >= 0 ? "+" : "") + fmt(diff).padStart(8)} | ${pct(drift).padStart(7)}`
    );
  }

  const y10Engine = ((pureResult.formula[9]?.traditionalBalance ?? 0) +
    (pureResult.formula[9]?.rothBalance ?? 0) +
    Math.max(0, (pureResult.formula[9]?.taxableBalance ?? 0) - (pureAccumClient.taxable_accounts ?? 0))) / 100;
  const y10Illust = ILLUSTRATION_NON_GUARANTEED[10];
  const initialPremium = (pureAccumClient.qualified_account_value ?? 0) / 100;
  const engineRate10yr = Math.pow(y10Engine / initialPremium, 1 / 10) - 1;
  const illustRate10yr = Math.pow(y10Illust / initialPremium, 1 / 10) - 1;
  console.log("\nImplied 10-year compound rate:");
  console.log(`  Illustration: ${pct(illustRate10yr)}`);
  console.log(`  Engine:       ${pct(engineRate10yr)}`);
  console.log(`  Rate-of-return setting in product config: ${cfg.form_defaults?.rate_of_return ?? 7}%`);

  // -- Mode 2: as configured (optimized conversion, taxes from taxable)
  const realInput = createSimulationInput(baseClient, product as CustomProductRow);
  const realResult = runGrowthSimulation(realInput);

  console.log("\n=== Mode 2: As-configured projection (optimized conversion, taxes from taxable) ===\n");
  console.log("Year | Age | Traditional      | Roth             | Taxable          | Total");
  console.log("-".repeat(95));
  const checkpoints = [1, 5, 10, 15, 20, 25];
  for (const yr of checkpoints) {
    const idx = yr - 1;
    if (idx >= realResult.formula.length) continue;
    const r = realResult.formula[idx];
    const trad = (r.traditionalBalance ?? 0) / 100;
    const roth = (r.rothBalance ?? 0) / 100;
    const taxable = (r.taxableBalance ?? 0) / 100;
    const total = trad + roth + taxable;
    console.log(
      `${String(yr).padStart(4)} | ${String(70 + yr).padStart(3)} | ` +
      `${fmt(trad).padStart(16)} | ${fmt(roth).padStart(16)} | ` +
      `${fmt(taxable).padStart(16)} | ${fmt(total)}`
    );
  }

  const lastRow = realResult.formula[realResult.formula.length - 1];
  const lastYear = realResult.formula.length;
  console.log(
    `\nEnd of plan (year ${lastYear}, age ${70 + lastYear}):`
  );
  console.log(`  Traditional IRA:  ${fmt((lastRow.traditionalBalance ?? 0) / 100)}`);
  console.log(`  Roth IRA:         ${fmt((lastRow.rothBalance ?? 0) / 100)}`);
  console.log(`  Taxable account:  ${fmt((lastRow.taxableBalance ?? 0) / 100)}`);
  console.log(
    `  Total net worth:  ${fmt(
      ((lastRow.traditionalBalance ?? 0) +
        (lastRow.rothBalance ?? 0) +
        (lastRow.taxableBalance ?? 0)) / 100
    )}`
  );

  process.exit(0);
})();
