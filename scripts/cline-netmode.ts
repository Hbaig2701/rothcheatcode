import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv"; import { resolve } from "path";
import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const $=(c:number)=>"$"+((c||0)/100).toLocaleString('en-US',{maximumFractionDigits:0});
(async()=>{
  const {data}=await admin.from("clients").select("*").eq("id","819593d9-d988-412b-a4e3-78dad9b56728").single();
  const c=data as Client;
  const wdNet=(c.withdrawals||[]).map(w=>({...w, net:true}));
  const gross=runGrowthSimulation(createSimulationInput(c,null));
  const net=runGrowthSimulation(createSimulationInput({...c, withdrawals:wdNet} as Client,null));

  // marginal tax on the IRA distribution, to derive net cash kept
  const netCash=(withArr:any[],noArr:any[],yr:number)=>{
    const w=withArr.find(y=>y.year===yr), n=noArr.find(y=>y.year===yr);
    const marg=(w.federalTax+w.stateTax)-(n.federalTax+n.stateTax);
    return w.iraWithdrawal - Math.max(0,marg);
  };
  const noWd=runGrowthSimulation(createSimulationInput({...c, withdrawals:[]} as Client,null));
  const noWdNet=noWd; // same (no withdrawals)

  console.log("BASELINE — GROSS mode (net=false) should pull exactly $70k and be unchanged:");
  for (const yr of [2030,2031,2035]){ const y=gross.baseline.find((x:any)=>x.year===yr) as any;
    console.log(`  age ${y.age}: iraWithdrawal ${$(y.iraWithdrawal)} (expect $70,000)`); }

  console.log("\nBASELINE — NET mode (net=true) should GROSS UP so client nets ~$70k:");
  for (const yr of [2030,2031,2035]){ const y=net.baseline.find((x:any)=>x.year===yr) as any;
    console.log(`  age ${y.age}: gross pull ${$(y.iraWithdrawal)} -> nets ~${$(netCash(net.baseline as any[], noWd.baseline as any[], yr))}`); }

  const lbG=gross.baseline[gross.baseline.length-1] as any, lbN=net.baseline[net.baseline.length-1] as any;
  const hr=((c as any).heir_tax_rate??40)/100;
  console.log("\nEnd-of-plan baseline legacy (net mode drains faster -> favors Roth):");
  console.log("  GROSS mode baseline net legacy:", $(lbG.netWorth-Math.round(lbG.traditionalBalance*hr)));
  console.log("  NET   mode baseline net legacy:", $(lbN.netWorth-Math.round(lbN.traditionalBalance*hr)));
  console.log("\nStrategy unaffected by net flag (pulls from Roth):");
  const sG=gross.formula.find((x:any)=>x.year===2030) as any, sN=net.formula.find((x:any)=>x.year===2030) as any;
  console.log(`  strategy age 67 rothWithdrawal: gross-mode ${$(sG.rothWithdrawal)} | net-mode ${$(sN.rothWithdrawal)} (should match)`);
})();
