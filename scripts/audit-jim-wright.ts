import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { runGrowthSimulation, runSimulation, createSimulationInput } from "../lib/calculations";
import { isGrowthProduct } from "../lib/config/products";
import type { Client } from "../lib/types/client";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const usd = (c: number) => "$" + Math.round((c ?? 0) / 100).toLocaleString();

(async () => {
  // Find Tim Wright's user id
  const { data: prof } = await admin.from("profiles").select("id,email").ilike("email", "%cornerstonefinancialtx%");
  const ids = (prof ?? []).map((p: any) => p.id);
  console.log("Tim Wright profile(s):", JSON.stringify(prof));

  let q = admin.from("clients").select("*").ilike("name", "%jim%");
  if (ids.length) q = q.in("user_id", ids);
  const { data: rows } = await q;
  if (!rows?.length) { console.log("No Jim found for this advisor."); return; }

  for (const c of rows as Client[]) {
    console.log("=".repeat(72));
    console.log(`Jim: ${c.name} (id=${c.id}) scenario=${c.scenario_name}`);
    console.log(`  filing=${c.filing_status} age=${c.age} spouseAge=${c.spouse_age} state=${c.state}`);
    console.log(`  qualified=${usd(c.qualified_account_value)} ror=${c.rate_of_return}% blueprint=${c.blueprint_type} custom=${c.custom_product_id}`);
    console.log(`  conv_type=${c.conversion_type} max_tax_rate=${c.max_tax_rate} constraint=${c.constraint_type} taxsrc=${c.tax_payment_source}`);
    console.log(`  end_age=${(c as any).end_age} years_to_defer=${(c as any).years_to_defer_conversion}`);
    console.log(`  SS: primary ${usd(c.ssi_annual_amount)}@${c.ssi_payout_age}  spouse ${usd(c.spouse_ssi_annual_amount ?? 0)}@${c.spouse_ssi_payout_age}`);
    const inc = (c.non_ssi_income ?? []);
    const byYear = inc.filter((e:any)=>e.year===inc[0]?.year);
    console.log(`  non_ssi streams (first yr): ${byYear.map((e:any)=>`${e.type}:${usd(e.gross_taxable)}`).join(", ")} | total entries=${inc.length}`);

    const run = (client: Client) => isGrowthProduct(client.blueprint_type as any)
      ? runGrowthSimulation(createSimulationInput(client, null)).formula
      : runSimulation(createSimulationInput(client, null)).formula;

    for (const rate of [24, 22]) {
      const variant = { ...c, max_tax_rate: rate, constraint_type: "bracket_ceiling" } as Client;
      const years = run(variant);
      let lastConvAge = 0, totalConv = 0, depletedAge = 0;
      for (const y of years) {
        if ((y.conversionAmount ?? 0) > 1000) { lastConvAge = y.age; totalConv += y.conversionAmount; }
        if (depletedAge === 0 && (y.traditionalBalance ?? 0) < 100) depletedAge = y.age;
      }
      const firstAge = years[0].age;
      console.log(`\n  --- target ${rate}% (bracket_ceiling) ---`);
      console.log(`    last conversion at age ${lastConvAge} (= ${lastConvAge - firstAge + 1} yrs of conversions) | totalConverted=${usd(totalConv)} | IRA depleted@${depletedAge || "never"}`);
      console.log(`    yr1 conv=${usd(years[0].conversionAmount)} taxInc=${usd(years[0].taxableIncome ?? 0)} | base income (no conv yrs after stop):`);
      for (const y of years.slice(0, 12)) {
        console.log(`      age ${y.age}: conv=${usd(y.conversionAmount).padStart(11)} taxInc=${usd(y.taxableIncome??0).padStart(11)} marg=${y.federalTaxBracket}% iraBal=${usd(y.traditionalBalance).padStart(12)} RMD=${usd(y.rmdAmount)}`);
      }
    }
  }
})();
