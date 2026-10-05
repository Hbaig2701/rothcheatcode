import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

(async () => {
  const { data: rows } = await admin.from("clients").select("*").eq("id", "01a58058-161c-4da9-8fbb-e3220d7bcb9f");
  const c = (rows as Client[])[0];
  const { data: cpRows } = await admin.from("custom_products").select("*").eq("id", c.custom_product_id);
  const customProduct = (cpRows as any[])?.[0] ?? null;

  const rothSimInput = createSimulationInput(c, customProduct);
  console.log("SIM INPUT startYear/endYear/age/end_age:", {
    startYear: (rothSimInput as any).startYear,
    endYear: (rothSimInput as any).endYear,
    age: (rothSimInput as any).client?.age ?? (rothSimInput as any).age,
  });

  const res = runGrowthSimulation(rothSimInput);
  console.log("baseline.length =", res.baseline?.length, " formula.length =", res.formula?.length);
  console.log("last baseline:", res.baseline?.[res.baseline.length - 1] ? "OK" : "UNDEFINED");
  console.log("last formula:", res.formula?.[res.formula.length - 1] ? "OK" : "UNDEFINED");

  // Simulate the exact simulationToProjection access that would throw a 500
  try {
    const lb = res.baseline[res.baseline.length - 1];
    const lf = res.formula[res.formula.length - 1];
    const x = lb.traditionalBalance + lf.traditionalBalance;
    console.log("simulationToProjection access OK, sum=", x);
  } catch (e: any) {
    console.log("!!! THROWS in simulationToProjection:", e.message);
  }

  // Dump first/last few years to see the shape
  console.log("baseline years:", (res.baseline ?? []).map((y: any) => y.year).join(","));

  // --- Check every top-level scalar for NaN / Infinity / non-integer / overflow ---
  const lb = res.baseline[res.baseline.length - 1];
  const lf = res.formula[res.formula.length - 1];
  const scalars: Record<string, any> = {
    break_even_age: res.breakEvenAge,
    total_tax_savings: res.totalTaxSavings,
    heir_benefit: res.heirBenefit,
    baseline_final_traditional: lb.traditionalBalance,
    baseline_final_roth: lb.rothBalance,
    baseline_final_taxable: lb.taxableBalance,
    baseline_final_net_worth: lb.netWorth,
    blueprint_final_traditional: lf.traditionalBalance,
    blueprint_final_roth: lf.rothBalance,
    blueprint_final_taxable: lf.taxableBalance,
    blueprint_final_net_worth: lf.netWorth,
  };
  const BIGINT_MAX = 9223372036854775807;
  console.log("\n--- SCALAR CHECK ---");
  for (const [k, v] of Object.entries(scalars)) {
    const bad = v === null || v === undefined ? "NULL" :
      Number.isNaN(v) ? "NaN!!!" :
      !Number.isFinite(v) ? "INFINITY!!!" :
      !Number.isInteger(v) ? `NON-INTEGER (${v})` :
      Math.abs(v) > BIGINT_MAX ? "OVERFLOW!!!" : "ok";
    console.log(`  ${k} = ${v}  [${bad}]`);
  }

  // Scan every year field in both arrays for NaN/Infinity
  console.log("\n--- YEAR-FIELD SCAN (NaN/Infinity) ---");
  let found = 0;
  for (const [label, arr] of [["baseline", res.baseline], ["formula", res.formula]] as const) {
    for (const y of arr as any[]) {
      for (const [k, v] of Object.entries(y)) {
        if (typeof v === "number" && (Number.isNaN(v) || !Number.isFinite(v))) {
          console.log(`  ${label} year ${y.year} field ${k} = ${v}`);
          found++;
        }
      }
    }
  }
  if (!found) console.log("  (none)");
})();
