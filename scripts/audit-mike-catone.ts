/**
 * Ticket investigation: Guillermo Silesky / Mike Catone.
 * "Input ~$100k income, expects conversions to fill the 24% bracket, but the
 *  strategy is showing conversions well in excess of the top of the 24% bracket."
 *
 * Pull the real client row, inspect the income/conversion/tax fields, then run
 * the growth projection and print year-by-year conversion + taxable income so
 * we can see where (if anywhere) the conversion exceeds the 24% ceiling.
 *
 * Usage: npx tsx scripts/audit-mike-catone.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";

config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const usd = (c: number) => "$" + Math.round((c ?? 0) / 100).toLocaleString();

(async () => {
  const { data: rows } = await admin
    .from("clients")
    .select("*")
    .ilike("name", "%catone%");

  if (!rows || rows.length === 0) {
    console.log("No client matching 'catone' found.");
    return;
  }

  for (const c of rows as Client[]) {
    console.log("=".repeat(70));
    console.log(`Client: ${c.name}  (id=${c.id})`);
    console.log(`  filing_status:        ${c.filing_status}`);
    console.log(`  age:                  ${c.age}  spouse_age: ${c.spouse_age}`);
    console.log(`  qualified_account:    ${usd(c.qualified_account_value)}`);
    console.log(`  rate_of_return:       ${c.rate_of_return}%`);
    console.log(`  constraint_type:      ${c.constraint_type}`);
    console.log(`  max_tax_rate:         ${c.max_tax_rate}%`);
    console.log(`  conversion_type:      ${c.conversion_type}`);
    console.log(`  tax_payment_source:   ${c.tax_payment_source}`);
    console.log(`  state / state_rate:   ${c.state} / ${c.state_tax_rate}`);
    console.log(`  gross_taxable_non_ssi:${usd(c.gross_taxable_non_ssi)}`);
    console.log(`  tax_exempt_non_ssi:   ${usd(c.tax_exempt_non_ssi)}`);
    console.log(`  additional_deductions:${usd(c.additional_deductions ?? 0)}`);
    console.log(`  ssi_payout_age:       ${c.ssi_payout_age}   ssi_annual: ${usd(c.ssi_annual_amount)}`);
    console.log(`  non_ssi_income[]:     ${JSON.stringify(c.non_ssi_income)}`);
    console.log(`  years_to_defer:       ${(c as any).years_to_defer_conversion}`);
    console.log(`  end_age:              ${(c as any).end_age}`);
    console.log(`  blueprint_type:       ${c.blueprint_type}  custom_product_id: ${c.custom_product_id}`);

    try {
      const input = createSimulationInput(c as Client, null);
      const sim = runGrowthSimulation(input);
      const years = sim.formula;
      // Single-filer 2026 24% bracket tops at $201,775 taxable income.
      console.log(`\n  --- Strategy year-by-year ---`);
      console.log(`  age | conversion  | taxableInc  | marg% | irmaaTier | totalTax    | RMD         | iraBal`);
      let shown = 0;
      for (const y of years) {
        const conv = y.conversionAmount ?? 0;
        if (conv > 0 || shown < 2) {
          console.log(
            `  ${String(y.age).padStart(3)} | ${usd(conv).padStart(11)} | ${usd(y.taxableIncome ?? 0).padStart(11)} | ${String(y.federalTaxBracket ?? "").padStart(4)}% | ${String(y.irmaaTier ?? "").padStart(9)} | ${usd(y.totalTax).padStart(11)} | ${usd(y.rmdAmount).padStart(11)} | ${usd(y.traditionalBalance).padStart(11)}`
          );
          if (conv > 0) shown++;
        }
        if (shown > 18) break;
      }
    } catch (e) {
      console.log("  runGrowthSimulation threw:", (e as Error).message);
    }
  }
})();
