import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const $=(c:number)=>(c/100).toLocaleString('en-US',{maximumFractionDigits:0});
const sum=(a:any[],k:string)=>a.reduce((s,y)=>s+(Number(y[k])||0),0);
(async()=>{
  const {data}=await admin.from("clients").select("*").eq("id","cb7a54be-0098-4a87-b6da-e5b6b009a72c").single();
  const c=data as Client; const hr=((c as any).heir_tax_rate??40)/100;
  const run=(cc:Client,label:string)=>{
    const r=runGrowthSimulation(createSimulationInput(cc,null));
    const b=r.baseline[r.baseline.length-1] as any, f=r.formula[r.formula.length-1] as any;
    const bNet=b.netWorth-Math.round(b.traditionalBalance*hr), fNet=f.netWorth-Math.round(f.traditionalBalance*hr);
    const convTax=sum(r.formula as any[],'federalTaxOnConversions')+sum(r.formula as any[],'stateTaxOnConversions');
    console.log(label.padEnd(34), "convTax $"+$(convTax).padStart(9), "| net base $"+$(bNet).padStart(10), "strat $"+$(fNet).padStart(10), "-> strat wins by $"+$(fNet-bNet).padStart(9));
  };
  run(c, "CURRENT ($150k/yr from age 68)");
  run({...c, years_to_defer_conversion:2} as Client, "Defer 2yrs (start age 70, post-wages)");
  run({...c, years_to_defer_conversion:2, fixed_conversion_amount:20000000} as Client, "Defer 2yrs + $200k/yr");
  run({...c, tax_payment_source:'from_taxable'} as any, "Pay conv tax externally (not from IRA)");
})();
