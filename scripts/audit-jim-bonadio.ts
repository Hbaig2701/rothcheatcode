import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const usd = (c: number) => "$" + Math.round((c ?? 0) / 100).toLocaleString();

(async () => {
  // Jason Beyer / wealthbridgesolutions
  const { data: prof } = await admin.from("profiles").select("id,email").ilike("email", "%jason%wealthbridge%");
  console.log("Jason profile(s):", JSON.stringify(prof));
  const ids = (prof ?? []).map((p: any) => p.id);

  let q = admin.from("clients").select("*").ilike("name", "%bonadio%");
  const { data: rows } = await q;
  if (!rows?.length) { console.log("No Bonadio found."); return; }

  for (const c of rows as any[]) {
    console.log("=".repeat(72));
    console.log(`${c.name} (id=${c.id}) user_id=${c.user_id} scenario=${c.scenario_name}`);
    console.log(`  filing=${c.filing_status} age=${c.age} spouseAge=${c.spouse_age} state=${c.state} dob=${c.date_of_birth} spouse_dob=${c.spouse_date_of_birth}`);
    console.log(`  qualified=${usd(c.qualified_account_value)} ror=${c.rate_of_return}% blueprint=${c.blueprint_type} custom=${c.custom_product_id}`);
    console.log(`  conv_type=${c.conversion_type} max_tax_rate=${c.max_tax_rate} constraint=${c.constraint_type} taxsrc=${c.tax_payment_source}`);
    console.log(`  end_age=${c.end_age} years_to_defer=${c.years_to_defer_conversion} conversion_period_years=${c.conversion_period_years}`);
    console.log(`  held_back=${c.held_back_ira_value} held_back_rmd=${c.held_back_ira_rmd_treatment}`);
    console.log(`  SS: primary ${usd(c.ssi_annual_amount)}@${c.ssi_payout_age}  spouse ${usd(c.spouse_ssi_annual_amount ?? 0)}@${c.spouse_ssi_payout_age}`);
    console.log(`  non_ssi_income=`, JSON.stringify(c.non_ssi_income));
    console.log("  --- ALL FIELDS ---");
    for (const [k, v] of Object.entries(c)) {
      if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) {
        console.log(`    ${k} = ${typeof v === "object" ? JSON.stringify(v) : v}`);
      }
    }
  }
})();
