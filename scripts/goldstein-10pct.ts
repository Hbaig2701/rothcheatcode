import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv"; import { resolve } from "path";
import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const $=(c:number)=>"$"+(c/100).toLocaleString('en-US',{maximumFractionDigits:0});
(async()=>{
  const {data}=await admin.from("clients").select("*").eq("id","cb7a54be-0098-4a87-b6da-e5b6b009a72c").single();
  const c={...data, traditional_ira:100000000, qualified_account_value:100000000} as Client;
  console.log("surrender_years:",(data as any).surrender_years,"| penalty_free_percent:",(data as any).penalty_free_percent,"| respect_penalty_free_limit:",(data as any).respect_penalty_free_limit);
  const r=runGrowthSimulation(createSimulationInput({...c,conversion_type:'optimized_amount'} as Client,null));
  console.log("\nYEAR KEYS:", Object.keys(r.formula[0]).filter(k=>/boy|balance|convert|combined|surrender|penalty|value/i.test(k)).join(", "));
  const show=(type:string,label:string)=>{
    const rr=runGrowthSimulation(createSimulationInput({...c,conversion_type:type} as Client,null));
    console.log(`\n=== ${label} — is each conversion within 10% free withdrawal? ===`);
    console.log("yr  age  BOY annuity val   10% free      converted     over 10%?");
    for (const y of rr.formula as any[]) {
      if (y.year>2035) break;
      const boy=y.traditionalBOY ?? 0;
      const free=Math.round(boy*0.10);
      const conv=y.conversionAmount||0;
      if (conv===0 && y.year>2031) continue;
      console.log(`${y.year} ${String(y.age).padStart(3)}  ${$(boy).padStart(13)} ${$(free).padStart(11)} ${$(conv).padStart(13)}   ${conv>free?'*** YES +'+$(conv-free):'ok'}`);
    }
  };
  show('fixed_amount','FIXED $150k/yr');
  show('optimized_amount','OPTIMIZED @ 24%');
})();
