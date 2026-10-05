import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { createSimulationInput, runGrowthSimulation } from "../lib/calculations";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const d = (c?: number) => "$" + ((c ?? 0)/100).toLocaleString("en-US", {maximumFractionDigits:0});
(async () => {
  const { data: client } = await admin.from("clients").select("*").eq("id", "f758c471-0bcb-48be-8caf-565f74523e88").single();
  const { data: cp } = await admin.from("custom_products").select("*").eq("id", client.custom_product_id).single();
  const sum = (rows:any[], f:string) => rows.reduce((s,y)=>s+(y[f]??0),0);

  // SANITY 1: zero credit must be byte-identical to no field at all
  const base0 = runGrowthSimulation(createSimulationInput({ ...client, tax_credits: 0, conversion_type:"optimized_amount" } as any, cp as any));
  const baseNull = runGrowthSimulation(createSimulationInput({ ...client, tax_credits: null, conversion_type:"optimized_amount" } as any, cp as any));
  const identical = JSON.stringify(base0.formula)===JSON.stringify(baseNull.formula) && JSON.stringify(base0.baseline)===JSON.stringify(baseNull.baseline);
  console.log(`SANITY: tax_credits=0 vs null identical? ${identical ? "✅ YES" : "❌ NO"}`);

  // Klink with NO additional deduction (the correct setup) + $300K credit, optimized
  for (const credit of [0, 30000000]) {
    const c = { ...client, additional_deductions: 0, tax_credits: credit, conversion_type: "optimized_amount" };
    const res = runGrowthSimulation(createSimulationInput(c as any, cp as any));
    const lastS = res.formula[res.formula.length-1], lastB = res.baseline[res.baseline.length-1];
    const heirRate = (client.heir_tax_rate ?? 32)/100;
    const legacy = (l:any)=> l.rothBalance + l.taxableBalance + Math.round(l.traditionalBalance*(1-heirRate));
    console.log(`\n=== credit=${d(credit)} | additional_deductions=0 | optimized ===`);
    console.log(`  STRATEGY lifetimeFedTax=${d(sum(res.formula,"federalTax"))}  creditUsed=${d(sum(res.formula,"taxCreditApplied"))}  endLegacy=${d(legacy(lastS))}`);
    console.log(`  BASELINE lifetimeFedTax=${d(sum(res.baseline,"federalTax"))}  creditUsed=${d(sum(res.baseline,"taxCreditApplied"))}  endLegacy=${d(legacy(lastB))}`);
    console.log(`  HEADLINE totalTaxSavings=${d(res.totalTaxSavings)}  breakEven=${res.breakEvenAge}  heirBenefit=${d(res.heirBenefit)}`);
    // show first 4 strategy years' credit draw
    console.log(`  Strategy credit draw by age:`, res.formula.slice(0,5).map(y=>`${y.age}:${d(y.taxCreditApplied)}/fed ${d(y.federalTax)}`).join("  "));
  }
})();
