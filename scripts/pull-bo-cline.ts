import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv"; import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
(async()=>{
  const {data:prof}=await admin.from("profiles").select("id,email").eq("email","gshaw@mysummitadvisors.com").maybeSingle();
  console.log("Gerald profile:",JSON.stringify(prof));
  const {data:clients}=await admin.from("clients").select("id,name,blueprint_type,conversion_type,withdrawal_type,withdrawals,age,start_age,income_start_age,traditional_ira,qualified_account_value,ssi_payout_age,ssi_annual_amount,spouse_ssi_annual_amount").ilike("name","%cline%");
  console.log("\nBo Cline clients:");
  console.log(JSON.stringify(clients,null,2));
})();
