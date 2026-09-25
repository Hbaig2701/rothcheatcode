/**
 * Airinhos Serradas (ams@teamfc.com) — why every Roth-conversion scenario
 * comes out negative. Reproduces the projections-route code path exactly
 * (verified against the stored `projections` rows to the dollar).
 *
 *   npx tsx scripts/audit-airinhos-serradas.ts
 *
 * Companion: scripts/audit-airinhos-engine.ts (shared route-replica harness).
 */
import { runLikeRoute, headline, usd, getClient } from "./audit-airinhos-engine";
import type { Client } from "../lib/types/client";

const divs = (n: number, g = 0.07) => Array.from({ length: n }, (_, i) => ({
  age: String(67 + i), type: "dividends", year: 2026 + i, tax_exempt: 0,
  gross_taxable: Math.round(10500000 * Math.pow(1 + g, i)),
}));

function mk(over: any = {}): Client {
  return {
    name: "Airinhos real client", date_of_birth: "1959-01-01", age: 67, state: "NY",
    filing_status: "single", life_expectancy: 90, end_age: 90, start_age: 67, projection_years: 23,
    traditional_ira: 270000000, qualified_account_value: 270000000,
    roth_ira: 610000000, taxable_accounts: 3264900000, other_retirement: 0,
    state_tax_rate: 13.56, federal_bracket: "35", include_niit: false, include_aca: false,
    ss_self: 2400000, ssi_annual_amount: 2400000, ss_start_age: 67, ssi_payout_age: 67,
    non_ssi_income: divs(24),
    blueprint_type: "none", carrier_name: "none", product_name: "No Annuity", bonus_percent: 0,
    rate_of_return: 6, growth_rate: 6, baseline_comparison_rate: 6, inflation_rate: 2.5,
    tax_payment_source: "from_taxable", rmd_treatment: "reinvested",
    conversion_type: "optimized_amount", constraint_type: "bracket_ceiling", max_tax_rate: 24,
    target_irmaa_tier: "standard", heir_tax_rate: 40, heir_bracket: "40",
    aum_allocation_percent: 0, aum_fee_percent: 0, aum_dividend_yield: 2, aum_turnover_percent: 10,
    ltcg_rate: 15, withdrawal_type: "no_withdrawals", withdrawals: [], respect_penalty_free_limit: false,
    penalty_free_scope: "tax_only", surrender_years: 0, penalty_free_percent: 0,
    years_to_defer_conversion: 0, protect_initial_premium: true, payout_type: "individual",
    guaranteed_rate_of_return: 0, rmds_handled_externally: false, gi_legacy_mode: false,
    ...over,
  } as unknown as Client;
}

function stat(c: Client) {
  const r = runLikeRoute(c);
  const h = headline(c, r);
  let conv = 0, fedC = 0, stC = 0;
  for (const y of r.formula as any[]) { conv += y.conversionAmount ?? 0; fedC += y.federalTaxOnConversions ?? 0; stC += y.stateTaxOnConversions ?? 0; }
  const cy = (r.formula as any[]).filter(y => (y.conversionAmount ?? 0) > 100);
  return { d: h.diff, base: h.baseNet, conv, tax: fedC + stC,
    rate: conv + fedC + stC ? ((fedC + stC) / (conv + fedC + stC)) * 100 : 0,
    ages: cy.length ? `${cy[0].age}-${cy[cy.length-1].age}` : "none" };
}
function show(label: string, c: Client) {
  const s = stat(c);
  console.log(`${label.padEnd(40)} conv=${usd(s.conv).padStart(12)} tax=${usd(s.tax).padStart(11)} @${s.rate.toFixed(1).padStart(5)}% ages ${s.ages.padEnd(7)} DIFF=${usd(s.d).padStart(14)}`);
  return s;
}

(async () => {
  console.log("### REAL CLIENT, rebuilt with the facts from the call");
  console.log("age 67 single NY(+NYC 13.56%) | SEP $2.7M | Roth $6.1M | brokerage $32.649M");
  console.log("SS $24k @67 | dividends $105k growing 7% | tax paid externally | horizon age 90 | heir 40%\n");

  console.log("-- max_tax_rate sweep @ 6% return (what the model says today) --");
  for (const mr of [0, 22, 24, 32, 35, 37]) show(`  max=${mr}%`, mk({ max_tax_rate: mr }));

  console.log("\n-- same, but at the 20% his brokerage actually earns --");
  for (const mr of [22, 24, 32, 35, 37]) show(`  max=${mr}% ror=20%`, mk({ max_tax_rate: mr, rate_of_return: 20, growth_rate: 20, baseline_comparison_rate: 20 }));

  console.log("\n-- conversion type @ 6%, max=24 --");
  for (const ct of ["optimized_amount", "fixed_amount", "full_conversion", "partial_amount"])
    show(`  ${ct}`, mk({ conversion_type: ct, fixed_conversion_amount: 30000000, target_partial_amount: 270000000 }));

  console.log("\n-- heir rate (the Red Cross question) @ 6%, max=24 --");
  for (const hr of [0, 20, 30, 40, 50]) show(`  heir=${hr}%`, mk({ heir_tax_rate: hr, heir_bracket: String(hr) }));

  console.log("\n-- who pays the tax --");
  for (const src of ["from_taxable", "from_ira"]) show(`  ${src}`, mk({ tax_payment_source: src }));

  console.log("\n-- state rate: NYC blend 13.56% vs NY-only 10.9% vs NY marginal 6.85% --");
  for (const sr of [13.56, 10.9, 6.85]) show(`  state=${sr}%`, mk({ state_tax_rate: sr }));

  console.log("\n-- horizon --");
  for (const ea of [73, 80, 85, 90, 95, 100]) show(`  end_age=${ea}`, mk({ end_age: ea, life_expectancy: ea, projection_years: ea - 67 }));
})();

// appended: dividend-treatment + NIIT checks
(async () => {
  console.log("\n\n### MODELING CHECKS");
  console.log("-- his $105k is QUALIFIED dividends; engine has no LTCG treatment for income rows --");
  show("  dividends as ordinary (today)", mk({}));
  show("  dividends removed from ordinary", mk({ non_ssi_income: [] }));
  show("  ...and at max=32%", mk({ non_ssi_income: [], max_tax_rate: 32 }));
  show("  ...and at max=35%", mk({ non_ssi_income: [], max_tax_rate: 35 }));
  console.log("\n-- NIIT (3.8%) is switched OFF on his file; single filer >$200k MAGI owes it --");
  for (const n of [false, true]) show(`  include_niit=${n}`, mk({ include_niit: n }));
})();
