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
  const c=data as Client; const hr=((c as any).heir_tax_rate??40)/100;
  const bl=runGrowthSimulation(createSimulationInput(c,null)).baseline;
  const lb=bl[bl.length-1] as any; const baseNet=lb.netWorth-Math.round(lb.traditionalBalance*hr);
  console.log("Baseline net to heirs:",$(baseNet),"\n");
  const run=(ceil:number)=>{
    const cc={...c, conversion_type:'optimized_amount', max_tax_rate:ceil, tax_rate:ceil, federal_bracket:String(ceil)} as any;
    const r=runGrowthSimulation(createSimulationInput(cc,null));
    const f=r.formula as any[]; const lf=f[f.length-1];
    const net=lf.netWorth-Math.round(lf.traditionalBalance*hr);
    const convTax=sum(f,'federalTaxOnConversions')+sum(f,'stateTaxOnConversions');
    const conv=sum(f,'conversionAmount');
    const c26=f.find(y=>y.year===2026), c27=f.find(y=>y.year===2027);
    console.log(`OPTIMIZED @ ${ceil}% ceiling:`);
    console.log(`   gross legacy ${$(lf.netWorth)} | net to heirs ${$(net)} | wins by ${$(net-baseNet)}`);
    console.log(`   total converted ${$(conv)} | total conv tax ${$(convTax)} | trad left ${$(lf.traditionalBalance)}`);
    console.log(`   converts in wage yrs: 2026 ${$(c26?.conversionAmount||0)}, 2027 ${$(c27?.conversionAmount||0)}\n`);
  };
  run(24); run(32); run(35);
})();
