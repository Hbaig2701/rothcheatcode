import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const CLIENT_ID = "905d29d3-5ce1-4654-aa00-5dab580eaefb";

(async () => {
  // Conversion-relevant client inputs
  const { data: c } = await admin.from("clients").select("name,state,state_tax_rate,conversion_type,fixed_conversion_amount,target_partial_amount,gi_conversion_years,years_to_defer_conversion,constraint_type,max_tax_rate,tax_rate,ss_self,ss_spouse,ssi_annual_amount,spouse_ssi_annual_amount,non_ssi_income,qualified_account_value,bonus_percent,projection_years,end_age,age").eq("id", CLIENT_ID).single();
  console.log("=== CLIENT CONVERSION INPUTS ===");
  const { non_ssi_income, ...rest } = c as any;
  console.log(JSON.stringify(rest, null, 2));
  console.log("non_ssi_income entries:", (non_ssi_income ?? []).length);

  // Cached projection(s) the dashboard renders from
  const { data: projs } = await admin
    .from("projections")
    .select("id, created_at, input_hash, product_config_version")
    .eq("client_id", CLIENT_ID)
    .order("created_at", { ascending: false });
  console.log(`\n=== CACHED PROJECTIONS (${projs?.length ?? 0}) ===`);
  for (const p of projs ?? []) console.log(`id=${p.id} created=${p.created_at} hash=${p.input_hash?.slice(0,12)} cfgVer=${p.product_config_version}`);

  const { data: latest } = await admin
    .from("projections")
    .select("*")
    .eq("client_id", CLIENT_ID)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) { console.log("No cached projection."); return; }

  const by = (latest as any).blueprint_years ?? [];
  const conv = by.filter((y: any) => (y.conversionAmount ?? 0) > 0);
  let tc = 0, tf = 0, ts = 0;
  console.log("\nYear  Age  Conversion    FedBracket  FedTaxOnConv   StateTaxOnConv");
  for (const y of conv) {
    tc += y.conversionAmount ?? 0; tf += y.federalTaxOnConversions ?? 0; ts += y.stateTaxOnConversions ?? 0;
    console.log(`${y.year}  ${y.age}   ${((y.conversionAmount??0)/100).toLocaleString().padStart(11)}   ${String(y.federalTaxBracket).padStart(3)}%    ${((y.federalTaxOnConversions??0)/100).toLocaleString().padStart(11)}   ${((y.stateTaxOnConversions??0)/100).toLocaleString().padStart(11)}`);
  }
  console.log(`\nTotal Converted:        $${(tc/100).toLocaleString()}`);
  console.log(`Total Conversion Taxes: $${((tf+ts)/100).toLocaleString()}  (fed $${(tf/100).toLocaleString()} + state $${(ts/100).toLocaleString()})`);
  console.log(`Avg Tax Rate (fed+state): ${tc>0?(((tf+ts)/tc)*100).toFixed(1):0}%`);
  console.log(`Federal-only effective:   ${tc>0?((tf/tc)*100).toFixed(1):0}%`);
})();
