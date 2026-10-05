/**
 * Airinhos — evaluate the SEP conversion IN ISOLATION from the rest of the estate.
 * SEP-derived wealth = (what the SEP + everything it spawns is worth at the horizon,
 * after all tax) minus the same run with no SEP at all. Roth/brokerage net out.
 *   npx tsx scripts/audit-airinhos-sep-isolated.ts
 */
import { runLikeRoute, usd } from "./audit-airinhos-engine";
import type { Client } from "../lib/types/client";

const SEP = 270000000; // $2.7M per the call (stored row says $2.627M; he said "3 mil" today)
const divs = (n: number) => Array.from({ length: n }, (_, i) => ({ age: String(67 + i), type: "dividends", year: 2026 + i, tax_exempt: 0, gross_taxable: Math.round(10500000 * Math.pow(1.07, i)) }));
function mk(o: any = {}): Client {
  return { name: "sep", date_of_birth: "1959-01-01", age: 67, state: "NY", filing_status: "single",
    life_expectancy: 90, end_age: 90, start_age: 67, projection_years: 23,
    traditional_ira: SEP, qualified_account_value: SEP, roth_ira: 0,
    taxable_accounts: 300000000, // $3M tax reserve stand-in for the brokerage; nets out below
    state_tax_rate: 13.56, ss_self: 2400000, ssi_annual_amount: 2400000, ss_start_age: 67, ssi_payout_age: 67,
    non_ssi_income: divs(40), blueprint_type: "none", bonus_percent: 0,
    rate_of_return: 6, growth_rate: 6, baseline_comparison_rate: 6, inflation_rate: 2.5,
    tax_payment_source: "from_taxable", rmd_treatment: "reinvested",
    conversion_type: "optimized_amount", constraint_type: "bracket_ceiling", max_tax_rate: 24,
    target_irmaa_tier: "standard", heir_tax_rate: 40, aum_allocation_percent: 0, ltcg_rate: 15,
    withdrawal_type: "no_withdrawals", withdrawals: [], payout_type: "individual", ...o } as unknown as Client;
}
type Side = { trad: number; roth: number; taxable: number };
function last(rows: any[]): Side { const y = rows[rows.length - 1]; return { trad: y.traditionalBalance ?? 0, roth: y.rothBalance ?? 0, taxable: y.taxableBalance ?? 0 }; }
function evaluate(o: any) {
  const c = mk(o); const heir = 0.40;
  const r = runLikeRoute(c);
  const noSep = runLikeRoute(mk({ ...o, traditional_ira: 0, qualified_account_value: 0, conversion_type: "no_conversion" }));
  const ref = last(noSep.baseline).taxable;               // brokerage with no SEP at all
  const b = last(r.baseline), s = last(r.formula);
  let conv = 0, tax = 0; for (const y of r.formula as any[]) { conv += y.conversionAmount ?? 0; tax += (y.federalTaxOnConversions ?? 0) + (y.stateTaxOnConversions ?? 0); }
  const base = { tradAfterHeir: b.trad * (1 - heir), heirTax: b.trad * heir, rmdsReinvested: b.taxable - ref };
  const strat = { roth: s.roth, tradAfterHeir: s.trad * (1 - heir), brokerageHit: s.taxable - ref };
  const baseTotal = base.tradAfterHeir + base.rmdsReinvested;
  const stratTotal = strat.roth + strat.tradAfterHeir + strat.brokerageHit;
  return { conv, tax, b, s, base, strat, baseTotal, stratTotal, diff: stratTotal - baseTotal };
}
function row(label: string, o: any) {
  const e = evaluate(o);
  console.log(`${label.padEnd(26)} conv ${usd(e.conv).padStart(11)} tax ${usd(e.tax).padStart(11)} | DO NOTHING ${usd(e.baseTotal).padStart(12)} | CONVERT ${usd(e.stratTotal).padStart(12)} | diff ${usd(e.diff).padStart(11)} (${(e.diff / e.baseTotal * 100).toFixed(1).padStart(5)}%)`);
  return e;
}
(async () => {
  console.log(`SEP ${usd(SEP)} in isolation. Age 67, single, NY 13.56%, dividends $105k +7%/yr, SS $24k, heir 40%, horizon 90, tax paid from brokerage.\n`);
  console.log("=== DETAIL: 6% return, max 24% ===");
  const e = row("6% / max 24%", {});
  console.log(`  do nothing:  SEP grows to ${usd(e.b.trad)} pre-tax; heirs pay ${usd(e.base.heirTax)} → ${usd(e.base.tradAfterHeir)} net; RMDs taxed & reinvested add ${usd(e.base.rmdsReinvested)}`);
  console.log(`  convert:     Roth ${usd(e.strat.roth)} + leftover IRA net ${usd(e.strat.tradAfterHeir)}; brokerage side ${e.strat.brokerageHit>=0?"+":""}${usd(e.strat.brokerageHit)} vs no-SEP (RMDs from the unconverted remainder reinvested, net of the ${usd(e.tax)} tax paid)\n`);

  console.log("=== return x max tax rate ===");
  for (const g of [6, 8, 10, 12, 15]) {
    for (const m of [24, 32, 35, 37]) row(`${g}% / max ${m}%`, { rate_of_return: g, growth_rate: g, baseline_comparison_rate: g, max_tax_rate: m });
    console.log();
  }
  console.log("=== horizon sensitivity (6%, max 32%) ===");
  for (const ea of [80, 85, 90, 95, 100]) row(`to age ${ea}`, { max_tax_rate: 32, end_age: ea, life_expectancy: ea, projection_years: ea - 67 });
  console.log("\n=== heir rate sensitivity (6%, max 32%, to 90) — 0% = the Red Cross slice ===");
  for (const h of [0, 24, 40]) { const c = evaluate({ max_tax_rate: 32 }); const hb = c.b.trad * (1 - h / 100) + c.base.rmdsReinvested; const hs = c.s.roth + c.s.trad * (1 - h / 100) + c.strat.brokerageHit; console.log(`heir ${String(h).padStart(2)}%  DO NOTHING ${usd(hb).padStart(12)} | CONVERT ${usd(hs).padStart(12)} | diff ${usd(hs - hb).padStart(11)}`); }
})();
