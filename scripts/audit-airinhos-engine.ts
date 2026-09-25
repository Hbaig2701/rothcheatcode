/**
 * Reproduces the projections-route code path for Airinhos Serradas' scenarios
 * so we can explain why every run comes out negative.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { runGrowthSimulation, runSimulation, runAumScenario, createSimulationInput } from "../lib/calculations";
import { isGrowthProduct } from "../lib/config/products";
import { computeGrowthSummaryMetrics } from "../lib/calculations/growth-engine";
import type { Client } from "../lib/types/client";
import type { SimulationResult, YearlyResult } from "../lib/calculations";

config({ path: resolve(process.cwd(), ".env.local") });
export const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
export const usd = (c: any) => "$" + Math.round((Number(c) || 0) / 100).toLocaleString();

function buildRothSideClient(client: Client): Client {
  const pct = (client as any).aum_allocation_percent ?? 0;
  if (pct <= 0) return client;
  const reduced = Math.round((client.qualified_account_value ?? 0) * (1 - pct / 100));
  return { ...client, qualified_account_value: reduced };
}

export function runLikeRoute(client: Client) {
  const growth = isGrowthProduct((client.blueprint_type ?? "none") as any);
  const run = growth ? runGrowthSimulation : runSimulation;
  const rothSide = buildRothSideClient(client);
  const pct = (client as any).aum_allocation_percent ?? 0;
  let res: SimulationResult = run(createSimulationInput(rothSide, null));
  // fundConvTaxFromIraIfShort
  const taxable = client.taxable_accounts ?? 0;
  if (client.tax_payment_source !== "from_ira" && taxable > 0) {
    const convTax = res.formula.reduce((s, y: any) => s + (y.federalTaxOnConversions ?? 0) + (y.stateTaxOnConversions ?? 0), 0);
    if (convTax > 0 && taxable < convTax) {
      const reRun = run(createSimulationInput({ ...rothSide, tax_payment_source: "from_ira" } as Client, null));
      res = { ...reRun, baseline: res.baseline } as SimulationResult;
    }
  }
  const baselineFull = pct > 0 ? run(createSimulationInput(client, null)).baseline : res.baseline;
  let formula = res.formula;
  let aumYears: YearlyResult[] | null = null;
  if (pct > 0) {
    const startingIraPortion = Math.round((client.qualified_account_value ?? 0) * (pct / 100));
    aumYears = runAumScenario({ startingIraPortion, client, startYear: formula[0]?.year ?? 2026, projectionYears: formula.length, iraShortfallByYear: new Map() });
    formula = formula.map((y, i) => {
      const a: any = aumYears![i] ?? {};
      return { ...y,
        traditionalBalance: (y.traditionalBalance ?? 0) + (a.traditionalBalance ?? 0),
        rothBalance: (y.rothBalance ?? 0) + (a.rothBalance ?? 0),
        taxableBalance: (y.taxableBalance ?? 0) + (a.taxableBalance ?? 0),
        netWorth: (y.netWorth ?? 0) + (a.netWorth ?? 0),
        totalTax: (y.totalTax ?? 0) + (a.totalTax ?? 0),
        conversionAmount: (y.conversionAmount ?? 0) + (a.conversionAmount ?? 0),
        aumBalance: a.taxableBalance, aumTransfer: a.iraWithdrawal ?? 0, aumTax: a.totalTax,
      } as YearlyResult;
    });
  }
  const final = { ...res, baseline: baselineFull, formula } as SimulationResult;
  Object.assign(final, computeGrowthSummaryMetrics(client, final.baseline, final.formula));
  return final;
}

export function headline(client: Client, r: SimulationResult) {
  const heir = ((client as any).heir_tax_rate ?? Number(client.heir_bracket) ?? 40) / 100;
  const lb: any = r.baseline[r.baseline.length - 1];
  const lf: any = r.formula[r.formula.length - 1];
  const baseNet = (lb.netWorth ?? 0) - Math.round((lb.traditionalBalance ?? 0) * heir);
  const stratNet = (lf.netWorth ?? 0) - Math.round((lf.traditionalBalance ?? 0) * heir);
  return { heir, baseNet, stratNet, diff: stratNet - baseNet, lb, lf,
    totalTaxSavings: (r as any).totalTaxSavings, breakEvenAge: (r as any).breakEvenAge };
}

export async function getClient(id: string): Promise<Client> {
  const { data } = await admin.from("clients").select("*").eq("id", id).single();
  return data as Client;
}
