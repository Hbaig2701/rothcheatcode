import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv"; import { resolve } from "path";
import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const $=(c:number)=>"$"+(c/100).toLocaleString('en-US',{maximumFractionDigits:0});
(async()=>{
  const {data}=await admin.from("clients").select("*").eq("id","819593d9-d988-412b-a4e3-78dad9b56728").single();
  const c=data as Client;
  console.log("withdrawal_type:",(c as any).withdrawal_type,"| # withdrawals:",((c as any).withdrawals||[]).length,"| conversion:",(c as any).conversion_type);
  const r=runGrowthSimulation(createSimulationInput(c,null));
  console.log("\nYEAR KEYS:",Object.keys(r.formula[0]).filter(k=>/withdraw|roth|ira|tax|penalty/i.test(k)).join(", "));
  const show=(arr:any[],label:string)=>{
    console.log(`\n=== ${label} — withdrawal flow at age 67+ ===`);
    console.log("yr  age  iraWithdrawal  rothWithdrawal  fedTax+state  (gross pulled)");
    for (const y of arr){ if(![2030,2031,2035,2036,2040].includes(y.year))continue;
      const g=(y.iraWithdrawal||0)+(y.rothWithdrawal||0);
      console.log(`${y.year} ${String(y.age).padStart(3)} ${$(y.iraWithdrawal||0).padStart(13)} ${$(y.rothWithdrawal||0).padStart(14)} ${$((y.federalTax||0)+(y.stateTax||0)).padStart(12)}  ${$(g)}`);
    }
  };
  show(r.baseline as any[],"BASELINE (do nothing — pulls from IRA, taxable)");
  show(r.formula as any[],"STRATEGY (converted — pulls from Roth, tax-free)");
})();
