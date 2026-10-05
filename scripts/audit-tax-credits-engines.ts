import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { createSimulationInput, runSimulation, runGuaranteedIncomeSimulation } from "../lib/calculations";
import { runWidowScenario } from "../lib/calculations/scenarios/widow";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

let FAILS=0, CHECKS=0;
const approx=(a:number,b:number,tol=3)=>Math.abs((a??0)-(b??0))<=tol;
function assert(c:boolean,m:string){CHECKS++; if(!c){FAILS++; console.log("  ❌ "+m);}}
function compareRuns(label:string, withC:any[], noC:any[], pool:number, zeroGrowth:boolean){
  let cum=0;
  const n=Math.min(withC.length,noC.length);
  for(let i=0;i<n;i++){ const c=withC[i],z=noC[i]; cum+=c.taxCreditApplied??0; const t=`[${label} age${c.age}]`;
    if(!label.includes("WIDOW")) assert((c.traditionalBalance??0)>=-1&&(c.rothBalance??0)>=-1&&(c.taxableBalance??0)>=-1,`${t} neg balance`);
    assert((c.federalTax??0)>=0,`${t} fed neg ${c.federalTax}`);
    assert((c.taxCreditApplied??0)>=0,`${t} credit neg`);
    assert(approx(c.federalTax,(z.federalTax??0)-(c.taxCreditApplied??0)),`${t} fed!=fed0-credit ${c.federalTax}/${z.federalTax}/${c.taxCreditApplied}`);
    assert(approx(c.totalTax,(z.totalTax??0)-(c.taxCreditApplied??0)),`${t} total!=total0-credit ${c.totalTax}/${z.totalTax}/${c.taxCreditApplied}`);
    assert(approx(c.stateTax,z.stateTax),`${t} state changed`);
    assert(approx(c.irmaaSurcharge,z.irmaaSurcharge),`${t} irmaa changed`);
    assert(approx(c.taxableIncome,z.taxableIncome),`${t} taxableIncome changed`);
    assert(approx(c.conversionAmount,z.conversionAmount,5),`${t} conversion resized`);
    assert(approx(c.rothBalance,z.rothBalance,5),`${t} roth changed`);
    if((z.federalTax??0)===0) assert((c.taxCreditApplied??0)===0,`${t} drew on $0 fed`);
    assert(approx(c.netWorth-z.netWorth,cum,4),`${t} conservation Δ=${c.netWorth-z.netWorth} cum=${cum}`);
  }
  assert(cum<=pool+2,`[${label}] over-drew ${cum}/${pool}`);
}

(async()=>{
  const { data: client } = await admin.from("clients").select("*").eq("id","f758c471-0bcb-48be-8caf-565f74523e88").single();
  const base={...client, additional_deductions:0};
  const credits=[1,30000000,500000000];
  const growth=[{rate_of_return:7,growth_rate:7,baseline_comparison_rate:7,l:"g7"},{rate_of_return:0,growth_rate:0,baseline_comparison_rate:0,l:"g0"}];

  // ---- FIA formula engine (runSimulation) ----
  for(const ct of ["optimized_amount","full_conversion","no_conversion"]) for(const src of ["from_ira","from_taxable"]) for(const g of growth) for(const cr of credits){
    const common={...base, conversion_type:ct, tax_payment_source:src, taxable_accounts: src==="from_taxable"?50000000:0, rate_of_return:g.rate_of_return, growth_rate:g.growth_rate, baseline_comparison_rate:g.baseline_comparison_rate, bonus_percent:10};
    const w=runSimulation(createSimulationInput({...common,tax_credits:cr} as any));
    const z=runSimulation(createSimulationInput({...common,tax_credits:0} as any));
    compareRuns(`FIA/${ct.slice(0,4)}/${src.slice(5)}/${g.l}/cr${cr/100}:strat`, w.formula, z.formula, cr, g.rate_of_return===0);
    compareRuns(`FIA/${ct.slice(0,4)}/${src.slice(5)}/${g.l}/cr${cr/100}:base`, w.baseline, z.baseline, cr, g.rate_of_return===0);
  }

  // ---- GI engine ----
  for(const src of ["from_ira","from_taxable"]) for(const g of growth) for(const cr of credits){
    const common={...base, blueprint_type:"athene-ascent-pro-10", tax_payment_source:src, taxable_accounts: src==="from_taxable"?50000000:0, rate_of_return:g.rate_of_return, growth_rate:g.growth_rate, baseline_comparison_rate:g.baseline_comparison_rate};
    const w=runGuaranteedIncomeSimulation(createSimulationInput({...common,tax_credits:cr} as any));
    const z=runGuaranteedIncomeSimulation(createSimulationInput({...common,tax_credits:0} as any));
    compareRuns(`GI/${src.slice(5)}/${g.l}/cr${cr/100}:strat`, w.formula, z.formula, cr, g.rate_of_return===0);
    compareRuns(`GI/${src.slice(5)}/${g.l}/cr${cr/100}:base`, w.baseline, z.baseline, cr, g.rate_of_return===0);
  }

  // ---- Widow engine ----
  for(const g of growth) for(const cr of credits){
    const common={...base, rate_of_return:g.rate_of_return, growth_rate:g.growth_rate, baseline_comparison_rate:g.baseline_comparison_rate};
    const w=runWidowScenario({client:{...common,tax_credits:cr} as any, deathYear:2030, projectionYears:20});
    const z=runWidowScenario({client:{...common,tax_credits:0} as any, deathYear:2030, projectionYears:20});
    compareRuns(`WIDOW/${g.l}/cr${cr/100}`, w, z, cr, g.rate_of_return===0);
  }

  console.log(`\n${CHECKS} assertions across FIA + GI + Widow engines.`);
  console.log(FAILS===0?"✅ ALL INVARIANTS HOLD":`❌ ${FAILS} FAILURES`);
})();
