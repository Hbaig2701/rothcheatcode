import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const $ = (c:number)=> (c/100).toLocaleString('en-US',{maximumFractionDigits:0}).padStart(11);
const sum = (a:any[],k:string)=>a.reduce((s,y)=>s+(Number(y[k])||0),0);
(async()=>{
  const {data}=await admin.from("clients").select("*").eq("id","cb7a54be-0098-4a87-b6da-e5b6b009a72c").single();
  const c=data as Client;
  const r=runGrowthSimulation(createSimulationInput(c,null));
  const B=r.baseline as any[], S=r.formula as any[];
  const hr=((c as any).heir_tax_rate??40)/100;

  console.log("=== LIFETIME TOTALS ===");
  console.log("Bonus applied (strategy):        $", $(sum(S,'productBonusApplied')));
  console.log("Total converted (strategy):      $", $(sum(S,'conversionAmount')));
  console.log("Conversion tax paid (strategy):  $", $(sum(S,'federalTaxOnConversions')+sum(S,'stateTaxOnConversions')));
  console.log("Total fed+state tax (strategy):  $", $(sum(S,'federalTax')+sum(S,'stateTax')));
  console.log("Total RMDs forced (baseline):    $", $(sum(B,'rmdAmount')));
  console.log("Total fed+state tax (baseline):  $", $(sum(B,'federalTax')+sum(B,'stateTax')));
  console.log("IRMAA total (baseline/strategy): $", $(sum(B,'irmaaSurcharge')), " / $", $(sum(S,'irmaaSurcharge')));

  const lb=B[B.length-1], lf=S[S.length-1];
  console.log("\n=== AT DEATH (age 94) ===");
  console.log("                 Baseline      Strategy");
  console.log("Traditional   $", $(lb.traditionalBalance), " $", $(lf.traditionalBalance));
  console.log("Roth          $", $(lb.rothBalance||0),      " $", $(lf.rothBalance||0));
  console.log("Taxable       $", $(lb.taxableBalance||0),   " $", $(lf.taxableBalance||0));
  console.log("Gross         $", $(lb.netWorth),            " $", $(lf.netWorth));
  console.log("Heir tax(40%) $", $(Math.round(lb.traditionalBalance*hr)), " $", $(Math.round(lf.traditionalBalance*hr)));
  console.log("NET to heirs  $", $(lb.netWorth-Math.round(lb.traditionalBalance*hr)), " $", $(lf.netWorth-Math.round(lf.traditionalBalance*hr)));

  console.log("\n=== KEY YEARS: STRATEGY (conversion + tax from IRA) ===");
  console.log("yr    age  convert     convTax    bonus       traditional   roth");
  for (const y of S) if ([2026,2027,2028,2029,2030,2031,2033].includes(y.year))
    console.log(y.year, String(y.age).padStart(3),"$",$(y.conversionAmount||0),"$",$((y.federalTaxOnConversions||0)+(y.stateTaxOnConversions||0)),"$",$(y.productBonusApplied||0),"$",$(y.traditionalBalance),"$",$(y.rothBalance||0));

  console.log("\n=== KEY YEARS: BASELINE (RMD + tax) ===");
  console.log("yr    age  rmd         totalTax    traditional   taxable");
  for (const y of B) if ([2026,2027,2031,2035,2040,2046,2052].includes(y.year))
    console.log(y.year, String(y.age).padStart(3),"$",$(y.rmdAmount||0),"$",$((y.federalTax||0)+(y.stateTax||0)),"$",$(y.traditionalBalance),"$",$(y.taxableBalance||0));
})();
