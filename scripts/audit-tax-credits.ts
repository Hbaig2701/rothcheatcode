import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { createSimulationInput, runGrowthSimulation } from "../lib/calculations";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

let FAILS = 0, CHECKS = 0;
const approx = (a:number,b:number,tol=2)=>Math.abs((a??0)-(b??0))<=tol;
function assert(cond:boolean, msg:string){ CHECKS++; if(!cond){ FAILS++; console.log("  ❌ "+msg); } }

function compareRuns(label:string, withC:any[], noC:any[], pool:number, zeroGrowth:boolean){
  let cumCredit = 0;
  for(let i=0;i<withC.length;i++){
    const c=withC[i], z=noC[i];
    cumCredit += c.taxCreditApplied ?? 0;
    const tag=`[${label} age${c.age}]`;
    // balances non-negative
    assert((c.traditionalBalance??0)>=-1 && (c.rothBalance??0)>=-1 && (c.taxableBalance??0)>=-1, `${tag} negative balance trad=${c.traditionalBalance} roth=${c.rothBalance} tax=${c.taxableBalance}`);
    // fed tax & credit non-negative
    assert((c.federalTax??0)>=0, `${tag} federalTax negative ${c.federalTax}`);
    assert((c.taxCreditApplied??0)>=0, `${tag} taxCreditApplied negative ${c.taxCreditApplied}`);
    // credit exactly reduces federal tax: fed_C == fed_0 - credit
    assert(approx(c.federalTax, (z.federalTax??0)-(c.taxCreditApplied??0)), `${tag} fed mismatch: fed_C=${c.federalTax} fed_0=${z.federalTax} credit=${c.taxCreditApplied}`);
    // totalTax reduced by exactly the credit (state/irmaa/penalty untouched)
    assert(approx(c.totalTax, (z.totalTax??0)-(c.taxCreditApplied??0)), `${tag} totalTax mismatch tot_C=${c.totalTax} tot_0=${z.totalTax} credit=${c.taxCreditApplied}`);
    // credit must not touch state/irmaa/income/bracket/conversion/roth/trad
    assert(approx(c.stateTax,z.stateTax), `${tag} stateTax changed ${c.stateTax} vs ${z.stateTax}`);
    assert(approx(c.irmaaSurcharge,z.irmaaSurcharge), `${tag} irmaa changed`);
    assert(approx(c.taxableIncome,z.taxableIncome), `${tag} taxableIncome changed (bracket contamination!)`);
    assert((c.federalTaxBracket??0)===(z.federalTaxBracket??0), `${tag} bracket changed ${c.federalTaxBracket} vs ${z.federalTaxBracket}`);
    assert((c.irmaaTier??0)===(z.irmaaTier??0), `${tag} irmaaTier changed`);
    assert(approx(c.conversionAmount,z.conversionAmount,5), `${tag} conversion resized ${c.conversionAmount} vs ${z.conversionAmount}`);
    assert(approx(c.rothBalance,z.rothBalance,5), `${tag} roth changed by credit ${c.rothBalance} vs ${z.rothBalance}`);
    assert(approx(c.traditionalBalance,z.traditionalBalance,5), `${tag} traditional changed by credit ${c.traditionalBalance} vs ${z.traditionalBalance}`);
    // taxable gets the retained cash
    assert((c.taxableBalance??0)>=(z.taxableBalance??0)-2, `${tag} taxable lower with credit ${c.taxableBalance} vs ${z.taxableBalance}`);
    // no draw in zero-tax years
    if((z.federalTax??0)===0) assert((c.taxCreditApplied??0)===0, `${tag} drew credit ${c.taxCreditApplied} with $0 fed tax`);
    // decomposition sums to fed tax, non-negative
    const dsum=(c.federalTaxOnSS??0)+(c.federalTaxOnConversions??0)+(c.federalTaxOnOrdinaryIncome??0);
    assert(approx(dsum,c.federalTax,3), `${tag} fed decomposition ${dsum} != fed ${c.federalTax}`);
    assert((c.federalTaxOnConversions??0)>=0 && (c.federalTaxOnOrdinaryIncome??0)>=0 && (c.federalTaxOnSS??0)>=0, `${tag} negative fed component`);
    // zero-growth conservation: netWorth delta == cumulative credit
    assert(approx(c.netWorth-z.netWorth, cumCredit, 3), `${tag} conservation: ΔnetWorth=${c.netWorth-z.netWorth} != cumCredit=${cumCredit}`);
  }
  // pool never over-drawn
  assert(cumCredit<=pool+2, `[${label}] over-drew pool: used ${cumCredit} of ${pool}`);
}

(async () => {
  const { data: client } = await admin.from("clients").select("*").eq("id", "f758c471-0bcb-48be-8caf-565f74523e88").single();
  const { data: cp } = await admin.from("custom_products").select("*").eq("id", client.custom_product_id).single();
  const base = { ...client, additional_deductions: 0 }; // ensure there's tax to credit

  const convTypes = ["optimized_amount","fixed_amount","full_conversion","no_conversion"];
  const taxSrc = [
    { tax_payment_source:"from_ira", taxable_accounts:0 },
    { tax_payment_source:"from_taxable", taxable_accounts:50000000 },
    { tax_payment_source:"from_taxable", taxable_accounts:0 }, // funds from IRA fallback
  ];
  const rmd = ["spent","reinvested","cash"];
  const credits = [1, 5000000, 30000000, 500000000]; // $0.01, $50K, $300K, $5M
  const growth = [{rate_of_return:7, growth_rate:7, baseline_comparison_rate:7, label:"g7"},
                  {rate_of_return:0, growth_rate:0, baseline_comparison_rate:0, label:"g0"}];

  let scenarioCount=0;
  for(const ct of convTypes) for(const ts of taxSrc) for(const rt of rmd) for(const g of growth) for(const cr of credits){
    const common = { ...base, conversion_type:ct, ...ts, rmd_treatment:rt, rate_of_return:g.rate_of_return, growth_rate:g.growth_rate, baseline_comparison_rate:g.baseline_comparison_rate };
    const withC = runGrowthSimulation(createSimulationInput({ ...common, tax_credits:cr } as any, cp as any));
    const noC   = runGrowthSimulation(createSimulationInput({ ...common, tax_credits:0  } as any, cp as any));
    const lbl=`${ct.slice(0,4)}/${ts.tax_payment_source.slice(5)}/tax${(ts.taxable_accounts/100)||0}/${rt}/${g.label}/cr${cr/100}`;
    compareRuns(lbl+":strat", withC.formula, noC.formula, cr, g.rate_of_return===0);
    compareRuns(lbl+":base", withC.baseline, noC.baseline, cr, g.rate_of_return===0);
    scenarioCount++;
  }
  console.log(`\nRan ${scenarioCount} scenario pairs, ${CHECKS} assertions.`);
  console.log(FAILS===0 ? "✅ ALL INVARIANTS HOLD" : `❌ ${FAILS} FAILURES`);
})();
