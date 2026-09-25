import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv"; import { resolve } from "path";
import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const $=(c:number)=>"$"+(c/100).toLocaleString('en-US',{maximumFractionDigits:0});
const mk=(base:any,amt:number,src:string)=>({...base, withdrawals: Array.from({length:24},(_,i)=>({age:67+i,year:2030+i,amount:amt,source:src}))});
const twoRow=(base:any)=>({...base, withdrawals: Array.from({length:24},(_,i)=>[{age:67+i,year:2030+i,amount:9000000,source:'ira'},{age:67+i,year:2030+i,amount:7000000,source:'roth'}]).flat()});
(async()=>{
  const {data}=await admin.from("clients").select("*").eq("id","819593d9-d988-412b-a4e3-78dad9b56728").single();
  const yr=2032;
  const runShow=(cc:any,label:string)=>{
    const r=runGrowthSimulation(createSimulationInput(cc as Client,null));
    const b=(r.baseline as any[]).find(y=>y.year===yr), s=(r.formula as any[]).find(y=>y.year===yr);
    console.log(`${label}`);
    console.log(`   BASELINE  yr${yr}: pulled IRA ${$(b.iraWithdrawal||0)} + Roth ${$(b.rothWithdrawal||0)} = ${$((b.iraWithdrawal||0)+(b.rothWithdrawal||0))}`);
    console.log(`   STRATEGY  yr${yr}: pulled IRA ${$(s.iraWithdrawal||0)} + Roth ${$(s.rothWithdrawal||0)} = ${$((s.iraWithdrawal||0)+(s.rothWithdrawal||0))}\n`);
  };
  runShow(mk(data,7000000,'auto'), "A) Auto $70k (current)");
  runShow(mk(data,9000000,'auto'), "B) Auto $90k (his 'gross up' idea)");
  runShow(twoRow(data), "C) Two rows: IRA $90k + Roth $70k");
})();
