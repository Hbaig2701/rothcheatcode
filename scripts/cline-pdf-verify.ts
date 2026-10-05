import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv"; import { resolve } from "path";
import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const $=(c:number)=>"$"+((c||0)/100).toLocaleString('en-US',{maximumFractionDigits:0});
(async()=>{
  const {data}=await admin.from("clients").select("*").eq("id","819593d9-d988-412b-a4e3-78dad9b56728").single();
  const r=runGrowthSimulation(createSimulationInput(data as Client,null));
  console.log("NEW baseline 'Dist IRA' (=totalIRAWithdrawal) vs OLD (=rmdAmount):");
  for (const y of r.baseline as any[]) if([2030,2031,2035,2036].includes(y.year))
    console.log(`  age ${y.age}: NEW ${$(y.totalIRAWithdrawal)} | OLD(rmd) ${$(y.rmdAmount)}`);
  console.log("\nNEW strategy 'Dist Roth' (=rothWithdrawal) vs OLD ($0):");
  for (const y of r.formula as any[]) if([2030,2031,2035,2040].includes(y.year))
    console.log(`  age ${y.age}: NEW ${$(y.rothWithdrawal)} | OLD $0`);
})();
