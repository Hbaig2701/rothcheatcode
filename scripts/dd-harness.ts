import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { createSimulationInput, runGrowthSimulation } from "@/lib/calculations";
import { computePerYearMarginalConversionTax } from "@/lib/calculations/marginal-conversion-tax";
import { getStandardDeduction } from "@/lib/data/standard-deductions";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const D = (c?: number|null) => c==null?"n/a":(c/100).toLocaleString("en-US",{maximumFractionDigits:0});
const issues: string[] = [];
const chk = (cond: boolean, msg: string) => { if (!cond) issues.push(msg); };

(async () => {
  const { data: base } = await admin.from("clients").select("*").eq("id","02ab51ae-9a2f-4200-937c-87f508fa6fdd").maybeSingle();
  let cp:any = null;
  if (base?.custom_product_id) { const { data } = await admin.from("custom_products").select("*").eq("id", base.custom_product_id).maybeSingle(); cp = data; }

  const run = (over: any) => {
    const c = { ...base, ...over } as any;
    const r = runGrowthSimulation(createSimulationInput(c, cp));
    return { c, r };
  };

  const iraBal = (base!.qualified_account_value ?? 0);
  console.log(`IRA balance: $${D(iraBal)}  filing=${base!.filing_status} state=${base!.state} max_tax_rate=${base!.max_tax_rate} conv_type=${base!.conversion_type}\n`);

  // ---- A) bracket-ceiling, varying deduction ----
  console.log("=== A. Bracket-ceiling, varying additional_deductions ===");
  for (const ad of [null, 5000000, 20000000, 50000000, 200000000]) {
    const { r } = run({ additional_deductions: ad });
    const y = r.formula[0], b = r.baseline[0];
    const stdOnly = getStandardDeduction(base!.filing_status, y.age, y.spouseAge ?? undefined, y.year);
    const expectedEff = stdOnly + Math.max(0, ad ?? 0);
    const marg = computePerYearMarginalConversionTax(y as any, { ...base, additional_deductions: ad } as any);
    console.log(`ad=$${D(ad)} | conv=$${D(y.conversionAmount)} taxable=$${D(y.taxableIncome)} effDed=$${D(y.standardDeduction)} fed=$${D(y.federalTax)} state=$${D(y.stateTax)} | baselineFed=$${D(b.federalTax)} | margConvTax=$${D(marg)}`);
    chk(y.standardDeduction === expectedEff, `A: effDed ${y.standardDeduction} != expected ${expectedEff} (ad=${ad})`);
    chk((y.federalTax ?? 0) >= 0 && (y.stateTax ?? 0) >= 0, `A: negative tax (ad=${ad})`);
    chk((y.taxableIncome ?? 0) >= 0, `A: negative taxableIncome (ad=${ad})`);
    chk((y.conversionAmount ?? 0) <= iraBal + 1, `A: conversion $${D(y.conversionAmount)} EXCEEDS IRA $${D(iraBal)} (ad=${ad})`);
    chk(!Number.isNaN(y.federalTax) && !Number.isNaN(y.taxableIncome ?? 0), `A: NaN (ad=${ad})`);
    chk(marg >= 0, `A: negative marginal conv tax (ad=${ad})`);
  }

  // ---- B) FIXED conversion: more deduction must mean <= tax (monotonic) ----
  console.log("\n=== B. Fixed conversion $300k/yr, varying deduction (tax must be non-increasing) ===");
  let prevFed = Infinity;
  for (const ad of [null, 10000000, 30000000, 60000000]) {
    const { r, c } = run({ additional_deductions: ad, conversion_type: "fixed_amount", fixed_conversion_amount: 30000000 });
    const y = r.formula[0];
    const marg = computePerYearMarginalConversionTax(y as any, c);
    console.log(`ad=$${D(ad)} | conv=$${D(y.conversionAmount)} taxable=$${D(y.taxableIncome)} fed=$${D(y.federalTax)} state=$${D(y.stateTax)} margConvTax=$${D(marg)}`);
    chk((y.federalTax ?? 0) <= prevFed + 1, `B: fed tax INCREASED with more deduction (ad=${ad}): ${y.federalTax} > ${prevFed}`);
    prevFed = y.federalTax ?? 0;
    chk((y.conversionAmount ?? 0) <= iraBal + 1, `B: conv exceeds IRA (ad=${ad})`);
  }

  // ---- C) baseline (do-nothing) should also reflect deduction (lower tax) ----
  console.log("\n=== C. Baseline tax with/without deduction ===");
  const b0 = run({ additional_deductions: null }).r.baseline;
  const b1 = run({ additional_deductions: 50000000 }).r.baseline;
  const sumFed = (arr:any[]) => arr.reduce((s,y)=>s+(y.federalTax??0),0);
  console.log(`baseline lifetime fed: ad=0 -> $${D(sumFed(b0))}, ad=$500k -> $${D(sumFed(b1))}`);
  chk(sumFed(b1) <= sumFed(b0) + 1, `C: baseline tax not reduced by deduction`);

  console.log("\n=== ISSUES FOUND ===");
  if (issues.length === 0) console.log("none (invariants held)");
  else issues.forEach(i => console.log("  ✗ " + i));
})();
