import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import { applyHeldBackIraRmd } from "../lib/calculations/utils/held-back-ira";
import { getSeniorBonusDeduction } from "../lib/data/standard-deductions";
import type { Client } from "../lib/types/client";

config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const d = (cents: number | null | undefined) =>
  cents == null ? "—" : "$" + Math.round(cents / 100).toLocaleString();

(async () => {
  const { data: rows } = await admin
    .from("clients")
    .select("*")
    .ilike("name", "%weirich%");
  const c = (rows as Client[])?.[0];
  if (!c) throw new Error("Weirich client not found");
  const { data: cpRows } = await admin
    .from("custom_products")
    .select("*")
    .eq("id", c.custom_product_id);
  const customProduct = (cpRows as any[])?.[0] ?? null;

  console.log(`Client: ${(c as any).spouse_name} & ${c.name}`);
  console.log(
    `Filing: ${c.filing_status} | State: ${c.state} | tax_payment_source: ${(c as any).tax_payment_source}`
  );
  console.log(
    `DOB self(Barbara): ${(c as any).date_of_birth}  spouse(Michael): ${(c as any).spouse_dob}`
  );
  console.log(
    `max_tax_rate: ${(c as any).max_tax_rate}%  constraint: ${(c as any).constraint_type}  conversion_type: ${(c as any).conversion_type}`
  );
  console.log(
    `Qualified IRA: ${d((c as any).qualified_account_value)}  held_back_ira: ${d((c as any).held_back_ira_balance)}`
  );
  console.log("");

  // Production path (aum=0, from_ira => buildRothSideClient & fundConvTax are no-ops)
  const clientForSim = applyHeldBackIraRmd(c);
  const res = runGrowthSimulation(createSimulationInput(clientForSim, customProduct));

  console.log(
    "Year  AgeS/AgeSp   Conversion     AGI          StdDed      TaxableInc    → EngineOBBA   fn(magi)   Bracket"
  );
  for (const y of res.formula.slice(0, 6)) {
    const derived = (y.agi ?? 0) - (y.standardDeduction ?? 0) - (y.taxableIncome ?? 0);
    // Independent recompute using the year's own AGI as MAGI proxy (app's convention).
    const fn = getSeniorBonusDeduction(
      c.filing_status,
      y.agi ?? 0,
      y.age,
      y.spouseAge ?? undefined,
      y.year
    );
    console.log(
      `${y.year}  ${String(y.age).padStart(2)}/${String(y.spouseAge ?? "").padStart(2)}   ` +
        `${d(y.conversionAmount).padStart(11)}  ${d(y.agi).padStart(11)}  ${d(y.standardDeduction).padStart(9)}  ` +
        `${d(y.taxableIncome).padStart(11)}   ${d(derived).padStart(9)}  ${d(fn).padStart(9)}   ${y.federalTaxBracket}%`
    );
  }

  // Focused assertions
  const y2026 = res.formula.find((y) => y.year === 2026)!;
  const y2029 = res.formula.find((y) => y.year === 2029)!;
  const obba2026 = (y2026.agi ?? 0) - (y2026.standardDeduction ?? 0) - (y2026.taxableIncome ?? 0);
  const obba2029 = (y2029.agi ?? 0) - (y2029.standardDeduction ?? 0) - (y2029.taxableIncome ?? 0);

  console.log("\n=== ASSERTIONS ===");
  console.log(
    `2026 OBBA senior deduction applied by engine: ${d(obba2026)}  (expect $12,000)  ${
      obba2026 === 1200000 ? "PASS ✅" : "CHECK ⚠️"
    }`
  );
  console.log(
    `2026 recommended first-year conversion:       ${d(y2026.conversionAmount)}  (expect ~$59k, top of 12%)  bracket=${y2026.federalTaxBracket}%`
  );
  console.log(
    `2026 MAGI/AGI ${d(y2026.agi)} vs $150k phase-out threshold: ${
      (y2026.agi ?? 0) < 15000000 ? "under → full deduction ✅" : "OVER → partial ⚠️"
    }`
  );
  console.log(
    `2029 OBBA senior deduction applied by engine: ${d(obba2029)}  (expect $0, sunset after 2028)  ${
      obba2029 === 0 ? "PASS ✅" : "CHECK ⚠️"
    }`
  );

  // ---- What-if: bracket-ceiling (top of 12%) instead of the fixed $60k ----
  console.log("\n=== WHAT-IF: conversion_type=optimized_amount (top of 12% bracket) ===");
  const bcClient = { ...clientForSim, conversion_type: "optimized_amount" } as Client;
  const bc = runGrowthSimulation(createSimulationInput(bcClient, customProduct));
  console.log("Year  Age    Conversion     AGI          TaxableInc    → EngineOBBA   Bracket");
  for (const y of bc.formula.slice(0, 5)) {
    const derived = (y.agi ?? 0) - (y.standardDeduction ?? 0) - (y.taxableIncome ?? 0);
    console.log(
      `${y.year}  ${y.age}    ${d(y.conversionAmount).padStart(11)}  ${d(y.agi).padStart(11)}  ` +
        `${d(y.taxableIncome).padStart(11)}   ${d(derived).padStart(9)}   ${y.federalTaxBracket}%`
    );
  }
})();
