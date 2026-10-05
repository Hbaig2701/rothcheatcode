import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv"; import { resolve } from "path";
import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const $=(c:number)=>"$"+(c/100).toLocaleString('en-US',{maximumFractionDigits:0});
const sum=(a:any[],k:string)=>a.reduce((s,y)=>s+(Number(y[k])||0),0);
(async()=>{
  const {data}=await admin.from("clients").select("*").eq("id","cb7a54be-0098-4a87-b6da-e5b6b009a72c").single();
  const c={...data, traditional_ira:100000000, qualified_account_value:100000000} as Client;
  const hr=((data as any).heir_tax_rate??40)/100;
  const bl=runGrowthSimulation(createSimulationInput(c,null)).baseline; const lb=bl[bl.length-1] as any;
  const baseNet=lb.netWorth-Math.round(lb.traditionalBalance*hr);
  console.log("Baseline net to heirs:",$(baseNet),"\n");
  const run=(opts:any,label:string)=>{
    const rr=runGrowthSimulation(createSimulationInput({...c,...opts} as any,null));
    const f=rr.formula as any[]; const lf=f[f.length-1];
    const net=lf.netWorth-Math.round(lf.traditionalBalance*hr);
    console.log(`=== ${label} ===  net to heirs ${$(net)} | wins by ${$(net-baseNet)} | trad left ${$(lf.traditionalBalance)}`);
    console.log("  yr  age  BOY val      10% free    converted   within10%?");
    for (const y of f){ if(y.year>2036)break; const boy=y.traditionalBOY??0, free=Math.round(boy*.1), cv=y.conversionAmount||0; if(cv===0&&y.year>2033)continue;
      console.log(`  ${y.year} ${String(y.age).padStart(3)} ${$(boy).padStart(11)} ${$(free).padStart(10)} ${$(cv).padStart(11)}   ${cv<=free+100?'ok':'OVER +'+$(cv-free)}`); }
    console.log();
  };
  run({conversion_type:'optimized_amount', respect_penalty_free_limit:true, penalty_free_scope:'all_distributions'}, "OPTIMIZED + 10% cap (all_distributions)");
  run({conversion_type:'fixed_amount', respect_penalty_free_limit:true, penalty_free_scope:'all_distributions'}, "FIXED $150k + 10% cap (all_distributions)");
})();
