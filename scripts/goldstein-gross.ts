import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv"; import { resolve } from "path";
import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const $=(c:number)=>"$"+(c/100).toLocaleString('en-US',{maximumFractionDigits:0});
(async()=>{
  const {data}=await admin.from("clients").select("*").eq("id","cb7a54be-0098-4a87-b6da-e5b6b009a72c").single();
  const c=data as Client; const hr=((c as any).heir_tax_rate??40)/100;
  const g=(cc:Client,label:string)=>{
    const r=runGrowthSimulation(createSimulationInput(cc,null));
    const f=r.formula[r.formula.length-1] as any;
    const ht=Math.round(f.traditionalBalance*hr);
    console.log(label.padEnd(22),"gross(pre-heir-tax):",$(f.netWorth).padStart(12)," trad left:",$(f.traditionalBalance).padStart(8)," heir tax:",$(ht).padStart(8)," net:",$(f.netWorth-ht).padStart(12));
    return f.netWorth;
  };
  const bl=runGrowthSimulation(createSimulationInput(c,null)).baseline;
  const lb=bl[bl.length-1] as any;
  console.log("BASELINE".padEnd(22),"gross(pre-heir-tax):",$(lb.netWorth).padStart(12)," trad left:",$(lb.traditionalBalance).padStart(8)," heir tax:",$(Math.round(lb.traditionalBalance*hr)).padStart(8)," net:",$(lb.netWorth-Math.round(lb.traditionalBalance*hr)).padStart(12));
  const fixed=g(c,"FIXED $150k/yr");
  const opt=g({...c,conversion_type:'optimized_amount'} as Client,"OPTIMIZED (24% cap)");
  console.log("\nGROSS legacy difference (Optimized − Fixed):",$(opt-fixed));
})();
