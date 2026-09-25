import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv"; import { resolve } from "path";
import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const $=(c:number)=>(c/100).toLocaleString('en-US',{maximumFractionDigits:0});
(async()=>{
  const {data}=await admin.from("clients").select("*").eq("id","cb7a54be-0098-4a87-b6da-e5b6b009a72c").single();
  const c=data as Client; const hr=((c as any).heir_tax_rate??40)/100;
  const run=(cc:Client,label:string)=>{
    const r=runGrowthSimulation(createSimulationInput(cc,null));
    const f=r.formula as any[]; const b=r.baseline[r.baseline.length-1] as any, lf=f[f.length-1];
    const bNet=b.netWorth-Math.round(b.traditionalBalance*hr), fNet=lf.netWorth-Math.round(lf.traditionalBalance*hr);
    console.log(`\n${label}: heirs win by $${$(fNet-bNet)}  (strat net $${$(fNet)})`);
    console.log("  yr age  convert    convTax   effRate");
    for (const y of f) if ([2026,2027,2028,2029,2031,2033].includes(y.year)){
      const ct=(y.federalTaxOnConversions||0)+(y.stateTaxOnConversions||0);
      console.log(`  ${y.year} ${String(y.age).padStart(2)} $${$(y.conversionAmount||0).padStart(9)} $${$(ct).padStart(8)}  ${y.conversionAmount?((ct/y.conversionAmount)*100).toFixed(0)+'%':'-'}`);
    }
  };
  run(c, "CURRENT (Fixed $150k/yr, ignores ceiling)");
  run({...c, conversion_type:'optimized_amount'} as Client, "OPTIMIZED (respects 24% ceiling)");
})();
