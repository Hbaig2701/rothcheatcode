import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv"; import { resolve } from "path";
import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const $=(c:number)=>"$"+(c/100).toLocaleString('en-US',{maximumFractionDigits:0});
(async()=>{
  const {data}=await admin.from("clients").select("*").eq("id","819593d9-d988-412b-a4e3-78dad9b56728").single();
  const withWD=data as Client;
  const noWD={...data, withdrawals:[]} as Client;
  const rW=runGrowthSimulation(createSimulationInput(withWD,null));
  const rN=runGrowthSimulation(createSimulationInput(noWD,null));
  const idx=(arr:any[],yr:number)=>arr.find(y=>y.year===yr);
  console.log("Marginal tax on the $70k withdrawal (with minus without), and net kept:\n");
  console.log("yr  age | BASELINE tax on $70k -> nets | STRATEGY(Roth) tax on $70k -> nets");
  for (const yr of [2030,2031,2035,2040,2045]){
    const bW=idx(rW.baseline as any[],yr), bN=idx(rN.baseline as any[],yr);
    const sW=idx(rW.formula as any[],yr), sN=idx(rN.formula as any[],yr);
    const bTax=((bW.federalTax+bW.stateTax)-(bN.federalTax+bN.stateTax));
    const sTax=((sW.federalTax+sW.stateTax)-(sN.federalTax+sN.stateTax));
    console.log(`${yr} ${String(bW.age).padStart(3)} | base tax ${$(bTax).padStart(8)} -> keeps ${$(7000000-bTax).padStart(8)} | strat tax ${$(sTax).padStart(7)} -> keeps ${$(7000000-sTax).padStart(8)}`);
  }
})();
