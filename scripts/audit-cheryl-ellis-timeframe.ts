import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv"; import { resolve } from "path";
import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const $ = (c: number) => "$" + Math.round(c / 100).toLocaleString('en-US');

(async () => {
  const { data } = await admin.from("clients").select("*").eq("id", "ac91dabd-8c92-46b8-b692-aa8d7e4fd34f").single();
  const base = data as Client;

  const run = (label: string, patch: Partial<Client>) => {
    const c = { ...base, ...patch } as Client;
    const r = runGrowthSimulation(createSimulationInput(c, null));
    const f = r.formula as any[];
    const convYears = f.filter(y => (y.conversionAmount || 0) > 0);
    const totalConv = convYears.reduce((s, y) => s + y.conversionAmount, 0);
    const totalConvTax = f.reduce((s, y) => s + (y.conversionTax || 0), 0);
    const totalTax = f.reduce((s, y) => s + (y.totalTax || 0), 0);
    const baseTax = (r.baseline as any[]).reduce((s, y) => s + (y.totalTax || 0), 0);
    console.log(`\n=== ${label} ===`);
    console.log(`  conversion years: ${convYears.length} (${convYears[0]?.year}–${convYears[convYears.length - 1]?.year}), ages ${convYears[0]?.age}–${convYears[convYears.length - 1]?.age}`);
    console.log(`  total converted: ${$(totalConv)} | conversion tax: ${$(totalConvTax)} | lifetime tax strat/base: ${$(totalTax)} / ${$(baseTax)}`);
    const hr = (base.heir_tax_rate ?? 40) / 100;
    const lastF = f[f.length - 1], lastB = (r.baseline as any[])[(r.baseline as any[]).length - 1];
    const netLegacy = (y: any) => (y.netWorth ?? 0) - Math.round((y.traditionalBalance ?? 0) * hr);
    console.log(`  NET LEGACY @${lastF.age}: strategy ${$(netLegacy(lastF))} vs baseline ${$(netLegacy(lastB))} → delta ${$(netLegacy(lastF) - netLegacy(lastB))}`);
    console.log("  yr   age   BOY IRA        converted     conv tax     bracket   EOY IRA");
    for (const y of f.slice(0, 9)) {
      console.log(`  ${y.year} ${String(y.age).padStart(3)}  ${$(y.traditionalBOY ?? 0).padStart(11)}  ${$(y.conversionAmount || 0).padStart(11)}  ${$(y.conversionTax || 0).padStart(10)}   ${String(y.marginalBracket ?? y.bracket ?? '').padStart(5)}   ${$(y.traditionalEOY ?? y.traditionalBalance ?? 0).padStart(11)}`);
    }
    return r;
  };

  const r0 = run("CURRENT: optimized_amount @ max_tax_rate 12%", {});
  console.log("\nkeys:", Object.keys((r0.formula as any[])[0]).join(", "));
  run("optimized_amount @ 22%", { max_tax_rate: 22 } as any);
  run("optimized_amount @ 24%", { max_tax_rate: 24 } as any);
  run("fixed_amount $60,000 (his saved value)", { conversion_type: 'fixed_amount' });
  run("fixed_amount $70,000", { conversion_type: 'fixed_amount', fixed_conversion_amount: 7000000 });
  run("fixed_amount $75,000", { conversion_type: 'fixed_amount', fixed_conversion_amount: 7500000 });
  run("fixed_amount $80,000", { conversion_type: 'fixed_amount', fixed_conversion_amount: 8000000 });
  run("full_conversion", { conversion_type: 'full_conversion' });
})();
