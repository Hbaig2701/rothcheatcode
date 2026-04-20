"use client";

import { useState } from "react";
import type { Projection } from "@/lib/types/projection";
import type { Client } from "@/lib/types/client";
import type { YearlyResult } from "@/lib/calculations";
import { GIIncomeChart } from "@/components/results/gi-income-chart";
import { transformToGIIncomeChartData, transformToChartData } from "@/lib/calculations/transforms";
import { AdvancedFeaturesSection } from "@/components/results/advanced-features-section";
import { YearByYearTable } from "@/components/results/deep-dive/year-by-year-table";
import { Check, ChevronDown, ChevronUp, ArrowRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALL_PRODUCTS, type FormulaType } from "@/lib/config/products";
import {
  InfoTooltip,
  getTaxFreeWealthTooltip,
  getGuaranteedIncomeTooltip,
  getFinalIncomeBaseTooltip,
  getAnnualAdvantageTooltip,
  getBreakEvenTooltip,
  getDepletionAgeTooltip,
} from "./gi-info-tooltip";

interface GIReportDashboardProps {
  client: Client;
  projection: Projection;
}

// Currency formatter
const toUSD = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

// Sum helper
const sum = (years: YearlyResult[], key: keyof YearlyResult) =>
  years.reduce((acc, curr) => acc + (Number(curr[key]) || 0), 0);

export function GIReportDashboard({ client, projection }: GIReportDashboardProps) {
  const [tableView, setTableView] = useState<"strategy" | "baseline">("strategy");
  const [productDetailsOpen, setProductDetailsOpen] = useState(false);

  const incomeChartData = transformToGIIncomeChartData(projection);
  const chartData = transformToChartData(projection);
  const heirTaxRate = (client.heir_tax_rate ?? 40) / 100;

  // Get product config
  const productConfig = ALL_PRODUCTS[client.blueprint_type as FormulaType];

  // ===== Calculate metrics =====
  const giYearlyData = projection.gi_yearly_data || [];

  // Income Base Journey values
  // Use gi_purchase_amount (Roth balance at purchase) NOT client.qualified_account_value (Traditional IRA before conversion)
  // The bonus is applied to the Roth balance AFTER conversion, not to the original Traditional IRA
  const purchaseAmount = projection.gi_purchase_amount ?? client.qualified_account_value;
  const bonusPercent = client.bonus_percent || 0;
  const bonusAmount = Math.round(purchaseAmount * (bonusPercent / 100));
  const startingIncomeBase = projection.gi_income_base_at_start ?? (purchaseAmount + bonusAmount);
  const finalIncomeBase = projection.gi_income_base_at_income_age || startingIncomeBase;
  const rollUpGrowth = finalIncomeBase - startingIncomeBase;
  const payoutPercent = projection.gi_payout_percent || 0;
  const calculatedIncome = Math.round(finalIncomeBase * (payoutPercent / 100));

  // GI Baseline calculations (Traditional GI - taxable income)
  // Use the new GI comparison metrics from projection
  const baselineAnnualIncomeGross = projection.gi_baseline_annual_income_gross ?? 0;
  const baselineAnnualIncomeNet = projection.gi_baseline_annual_income_net ?? 0;
  const baselineAnnualTax = projection.gi_baseline_annual_tax ?? 0;
  const baselineIncomeBase = projection.gi_baseline_income_base ?? 0;

  // Sum baseline taxes from baseline_years
  const baseTax = sum(projection.baseline_years, "federalTax") + sum(projection.baseline_years, "stateTax");
  const baseIrmaa = sum(projection.baseline_years, "irmaaSurcharge");
  const baseFinalTraditional = projection.baseline_final_traditional;

  // For GI baseline, lifetime income is the key metric
  // Use FLAT TAX RATE for consistency across all displays (chart, table, cards)
  const baselineGIYearlyData = projection.gi_baseline_yearly_data || [];
  const flatTaxRate = client.tax_rate / 100;
  let baselineTotalNetIncome = 0;
  baselineGIYearlyData.forEach((year) => {
    if (year.phase === 'income') {
      const grossIncome = year.guaranteedIncomeGross || 0;
      const taxAtFlatRate = Math.round(grossIncome * flatTaxRate);
      baselineTotalNetIncome += grossIncome - taxAtFlatRate;
    }
  });

  // Fallback: calculate from projection comparison metrics if yearly data not available
  if (baselineTotalNetIncome === 0 && projection.gi_baseline_annual_income_net) {
    const incomeYears = client.end_age - (projection.gi_income_start_age || client.income_start_age || 70) + 1;
    baselineTotalNetIncome = projection.gi_baseline_annual_income_net * incomeYears;
  }

  // Heir tax only applies to traditional IRA portion (the GI account value)
  const baseHeirTax = Math.round(baseFinalTraditional * heirTaxRate);
  // Net legacy = final net worth (includes taxable where income accumulates) minus heir taxes
  const baseNetLegacy = projection.baseline_final_net_worth - baseHeirTax;
  // Lifetime wealth = net legacy (income already accumulated in taxableBalance within net_worth)
  const baseLifetimeWealth = baseNetLegacy;

  // Formula (GI) calculations - use data from the CONVERSION phase
  let blueConversionTax = 0;
  let totalConverted = 0;
  giYearlyData.forEach((giYear) => {
    if (giYear && giYear.phase === "conversion") {
      blueConversionTax += giYear.conversionTax || 0;
      totalConverted += giYear.conversionAmount || 0;
    }
  });

  const blueIrmaa = sum(projection.blueprint_years, "irmaaSurcharge");
  const blueFinalTraditional = projection.blueprint_final_traditional;
  const blueFinalRoth = projection.blueprint_final_roth;
  const giTotalGross = projection.gi_total_gross_paid ?? 0;
  const giTotalNet = projection.gi_total_net_paid ?? 0;
  const giTaxOnPayments = giTotalGross - giTotalNet;
  // Heir tax only applies to remaining traditional (annuity account value)
  const blueHeirTax = Math.round(blueFinalTraditional * heirTaxRate);
  // Net legacy = final net worth (includes taxable where GI payments accumulate) minus heir taxes
  const blueNetLegacy = projection.blueprint_final_net_worth - blueHeirTax;
  // Lifetime wealth = net legacy (taxes already deducted in engine)
  const blueLifetimeWealth = blueNetLegacy;

  // Differences
  const lifetimeWealthDiff = blueLifetimeWealth - baseLifetimeWealth;
  const lifetimeWealthPct = baseLifetimeWealth !== 0 ? lifetimeWealthDiff / Math.abs(baseLifetimeWealth) : 0;

  // Depletion info
  const depletionAge = projection.gi_depletion_age;
  const incomeStartAge = projection.gi_income_start_age || client.income_start_age;

  // Calculate cumulative income at depletion
  let cumulativeAtDepletion = 0;
  if (depletionAge && giYearlyData.length > 0) {
    for (const year of giYearlyData) {
      if (year.age <= depletionAge) {
        cumulativeAtDepletion += year.guaranteedIncomeNet;
      }
    }
  }

  // Format payout type display
  const payoutTypeDisplay = client.payout_type === "joint" ? "Joint Life" : "Single Life";

  return (
    <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden">
      <div className="p-9 space-y-6">
        {/* Section 1: The Guarantee (Hero Card) - Tax-Free Roth GI Income */}
        <div className="bg-accent border border-gold-border rounded-[16px] py-10 px-12 text-center relative">
          <div className="absolute top-4 right-4">
            <InfoTooltip
              {...getGuaranteedIncomeTooltip(
                finalIncomeBase,
                payoutPercent,
                projection.gi_strategy_annual_income_net || projection.gi_annual_income_gross || 0,
                client.carrier_name || "",
                incomeStartAge || 70
              )}
            />
          </div>
          <p className="text-sm uppercase tracking-[3px] text-[rgba(212,175,55,0.7)] mb-2 font-medium">
            Your Tax-Free Guaranteed Income
          </p>
          <div className="w-16 h-[2px] bg-gold mx-auto mb-6" />
          <p className="text-5xl font-mono font-semibold text-gold mb-1">
            {toUSD(projection.gi_strategy_annual_income_net || projection.gi_annual_income_gross || 0)}/year
          </p>
          <p className="text-lg font-display text-foreground mb-3">tax-free for life</p>

          {/* Comparison with baseline taxable income */}
          {projection.gi_baseline_annual_income_net && (
            <div className="bg-[rgba(0,0,0,0.2)] rounded-lg py-3 px-6 inline-block mb-4">
              <p className="text-sm text-text-dim">
                vs. Traditional GI: {toUSD(projection.gi_baseline_annual_income_gross || 0)}/year gross
                → <span className="text-red">{toUSD(projection.gi_baseline_annual_income_net)}/year after tax</span>
              </p>
            </div>
          )}

          <p className="text-base text-text-dim">
            Starting age {incomeStartAge} · {payoutTypeDisplay} · {payoutPercent.toFixed(2)}% payout rate
          </p>
          {projection.gi_annual_income_advantage && projection.gi_annual_income_advantage > 0 && (
            <p className="text-base text-green mt-2 font-medium">
              +{toUSD(projection.gi_annual_income_advantage)}/year advantage over traditional
            </p>
          )}
        </div>

        {/* Section 2: 4-Phase Journey */}
        {projection.gi_conversion_phase_years && projection.gi_conversion_phase_years > 0 && (
          <div className="bg-bg-card border border-border-default rounded-[14px] p-7">
            <p className="text-xs uppercase tracking-[1.5px] text-text-muted mb-6 font-medium">
              Your Tax-Free Income Journey
            </p>

            {/* 4-Phase Timeline */}
            <div className="flex items-stretch gap-3 mb-6 overflow-x-auto pb-2">
              {/* Phase 1: Conversion */}
              <div className="bg-bg-input border border-border-default rounded-[10px] p-5 min-w-[180px] flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-[rgba(212,175,55,0.15)] flex items-center justify-center text-gold text-sm font-bold">1</div>
                  <p className="text-sm font-medium text-gold uppercase tracking-wide">Convert</p>
                </div>
                <p className="text-2xl font-mono font-medium text-foreground mb-1">
                  {projection.gi_conversion_phase_years} years
                </p>
                <p className="text-xs text-text-muted mb-2">Traditional → Roth IRA</p>
                <p className="text-sm font-mono text-red">
                  Tax: {toUSD(projection.gi_total_conversion_tax || 0)}
                </p>
              </div>

              <div className="flex items-center">
                <ArrowRight className="w-5 h-5 text-text-muted" />
              </div>

              {/* Phase 2: Purchase */}
              <div className="bg-bg-input border border-border-default rounded-[10px] p-5 min-w-[180px] flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-[rgba(212,175,55,0.15)] flex items-center justify-center text-gold text-sm font-bold">2</div>
                  <p className="text-sm font-medium text-gold uppercase tracking-wide">Purchase</p>
                </div>
                <p className="text-2xl font-mono font-medium text-foreground mb-1">
                  Age {projection.gi_purchase_age}
                </p>
                <p className="text-xs text-text-muted mb-2">Buy GI in Roth IRA</p>
                <p className="text-sm font-mono text-green">
                  {toUSD(projection.gi_purchase_amount || 0)}
                </p>
              </div>

              <div className="flex items-center">
                <ArrowRight className="w-5 h-5 text-text-muted" />
              </div>

              {/* Phase 3: Grow (Deferral) */}
              <div className="bg-bg-input border border-border-default rounded-[10px] p-5 min-w-[180px] flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-[rgba(212,175,55,0.15)] flex items-center justify-center text-gold text-sm font-bold">3</div>
                  <p className="text-sm font-medium text-gold uppercase tracking-wide">Grow</p>
                </div>
                <p className="text-2xl font-mono font-medium text-foreground mb-1">
                  {projection.gi_deferral_years || 0} years
                </p>
                <p className="text-xs text-text-muted mb-2">Income Base grows</p>
                <p className="text-sm font-mono text-gold">
                  +{toUSD(rollUpGrowth)}
                </p>
              </div>

              <div className="flex items-center">
                <ArrowRight className="w-5 h-5 text-text-muted" />
              </div>

              {/* Phase 4: Income */}
              <div className="bg-accent border border-gold-border rounded-[10px] p-5 min-w-[180px] flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-[rgba(212,175,55,0.25)] flex items-center justify-center text-gold text-sm font-bold">4</div>
                  <p className="text-sm font-medium text-gold uppercase tracking-wide">Income</p>
                </div>
                <p className="text-2xl font-mono font-semibold text-gold mb-1">
                  For Life
                </p>
                <p className="text-xs text-[rgba(212,175,55,0.7)] mb-2">Tax-free payments</p>
                <p className="text-sm font-mono text-green">
                  {toUSD(projection.gi_strategy_annual_income_net || projection.gi_annual_income_gross || 0)}/yr
                </p>
              </div>
            </div>

            {/* Break-even callout */}
            {projection.gi_break_even_years && projection.gi_break_even_age && (
              <div className="bg-[rgba(74,222,128,0.05)] border border-[rgba(74,222,128,0.15)] rounded-lg p-4 text-center">
                <p className="text-sm text-green">
                  <span className="font-semibold">Break-even at age {projection.gi_break_even_age}</span>
                  {" "}({projection.gi_break_even_years} years after income starts) — then pure tax-free advantage
                </p>
              </div>
            )}
          </div>
        )}

        {/* Section 3: Income Base Journey */}
        <div className="bg-bg-card border border-border-default rounded-[14px] p-7">
          <p className="text-xs uppercase tracking-[1.5px] text-text-muted mb-6 font-medium">
            How Your Income Is Calculated
          </p>

          {/* Journey Flow */}
          <div className="flex items-center justify-between gap-3 mb-6 overflow-x-auto pb-2">
            {/* Step 1: Purchase Amount (Roth balance after conversion) */}
            <div className="bg-bg-input border border-border-default rounded-[10px] py-4 px-5 text-center min-w-[130px]">
              <p className="text-xl font-mono font-medium text-foreground">{toUSD(purchaseAmount)}</p>
              <p className="text-sm text-text-muted mt-1">GI Premium</p>
            </div>

            <span className="text-xl text-text-muted">→</span>

            {/* Step 2: Bonus */}
            <div className="bg-bg-input border border-border-default rounded-[10px] py-4 px-5 text-center min-w-[130px]">
              <p className="text-xl font-mono font-medium text-gold">+{toUSD(bonusAmount)}</p>
              <p className="text-sm text-text-muted mt-1">{bonusPercent}% Bonus</p>
            </div>

            <span className="text-xl text-text-muted">→</span>

            {/* Step 3: Starting Income Base */}
            <div className="bg-bg-input border border-border-default rounded-[10px] py-4 px-5 text-center min-w-[130px]">
              <p className="text-xl font-mono font-medium text-foreground">{toUSD(startingIncomeBase)}</p>
              <p className="text-sm text-text-muted mt-1">Starting Income Base</p>
            </div>

            <span className="text-xl text-text-muted">→</span>

            {/* Step 4: Roll-Up Growth */}
            <div className="bg-bg-input border border-border-default rounded-[10px] py-4 px-5 text-center min-w-[130px]">
              <p className="text-xl font-mono font-medium text-gold">+{toUSD(rollUpGrowth)}</p>
              <p className="text-sm text-text-muted mt-1">Roll-Up Growth</p>
            </div>

            <span className="text-xl text-text-muted">→</span>

            {/* Step 5: Final Income Base */}
            <div className="bg-accent border border-gold-border rounded-[10px] py-4 px-5 text-center min-w-[130px] relative">
              <div className="absolute top-1 right-1">
                <InfoTooltip
                  {...getFinalIncomeBaseTooltip(
                    purchaseAmount,
                    bonusPercent,
                    bonusAmount,
                    startingIncomeBase,
                    8, // Roll-up rate
                    projection.gi_deferral_years || 10,
                    finalIncomeBase,
                    client.carrier_name || ""
                  )}
                />
              </div>
              <p className="text-xl font-mono font-semibold text-gold">{toUSD(finalIncomeBase)}</p>
              <p className="text-sm text-[rgba(212,175,55,0.7)] mt-1">Final Income Base</p>
            </div>
          </div>

          {/* Formula Line */}
          <div className="pt-5 border-t border-border-default">
            <p className="text-base font-mono text-text-dim">
              {toUSD(finalIncomeBase)} × {payoutPercent.toFixed(2)}% = <span className="text-gold font-semibold">{toUSD(calculatedIncome)}/year guaranteed</span>
            </p>
          </div>
        </div>

        {/* Section 3: The Protection Promise */}
        <div className="bg-bg-card border border-border-default rounded-[14px] p-7 relative">
          {depletionAge && (
            <div className="absolute top-4 right-4">
              <InfoTooltip
                {...getDepletionAgeTooltip(
                  depletionAge,
                  projection.gi_annual_income_gross || 0,
                  cumulativeAtDepletion,
                  client.carrier_name || ""
                )}
              />
            </div>
          )}
          <p className="text-xs uppercase tracking-[1.5px] text-text-muted mb-5 font-medium">
            The Guarantee
          </p>

          {depletionAge && (
            <p className="text-base text-text-dim mb-5">
              Your Account Value is projected to deplete at age {depletionAge}.
            </p>
          )}

          {/* Checkmarks */}
          <div className="space-y-3 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-[rgba(74,222,128,0.1)] flex items-center justify-center shrink-0">
                <Check className="w-4 h-4 text-green" />
              </div>
              <p className="text-base text-foreground">
                Your guaranteed income of {toUSD(projection.gi_annual_income_gross || 0)}/year continues for life
              </p>
            </div>
            {depletionAge && cumulativeAtDepletion > 0 && (
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-[rgba(74,222,128,0.1)] flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4 text-green" />
                </div>
                <p className="text-base text-foreground">
                  You will have received {toUSD(cumulativeAtDepletion)} in income by age {depletionAge}
                </p>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-[rgba(74,222,128,0.1)] flex items-center justify-center shrink-0">
                <Check className="w-4 h-4 text-green" />
              </div>
              <p className="text-base text-foreground">
                Total projected lifetime income: {toUSD(giTotalGross)} (to age {client.end_age})
              </p>
            </div>
          </div>

          {/* Comparison Callout */}
          <div className="bg-[rgba(255,255,255,0.02)] border border-border-default rounded-[10px] p-5">
            <p className="text-sm text-text-dim italic">
              Without this guarantee, withdrawing {toUSD(projection.gi_annual_income_gross || 0)}/year from a traditional portfolio at 0% growth would deplete your funds entirely — with no further income.
            </p>
          </div>
        </div>

        {/* Section 4: Strategy Comparison Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Highlight Card: Tax-Free Wealth Created */}
          {projection.gi_tax_free_wealth_created !== null && projection.gi_tax_free_wealth_created !== undefined && (
            <div className="col-span-2 lg:col-span-4 bg-[rgba(74,222,128,0.05)] border border-[rgba(74,222,128,0.15)] rounded-[14px] p-6 text-center relative">
              <div className="absolute top-4 right-4">
                <InfoTooltip
                  {...getTaxFreeWealthTooltip(
                    projection.gi_strategy_annual_income_net || projection.gi_annual_income_gross || 0,
                    projection.gi_baseline_annual_income_net || 0,
                    client.end_age - (incomeStartAge || 70) + 1
                  )}
                />
              </div>
              <p className="text-xs uppercase tracking-[1.5px] text-[rgba(74,222,128,0.7)] mb-2 font-medium">
                Tax-Free Wealth Created
              </p>
              <p className="text-4xl font-mono font-semibold text-green mb-2">
                +{toUSD(projection.gi_tax_free_wealth_created)}
              </p>
              <p className="text-sm text-text-muted">
                Lifetime advantage over Traditional GI
                {projection.gi_percent_improvement && (
                  <span className={`${projection.gi_percent_improvement >= 0 ? "text-green" : "text-red"} ml-2`}>
                    ({projection.gi_percent_improvement >= 0 ? "+" : ""}{projection.gi_percent_improvement.toFixed(1)}% improvement)
                  </span>
                )}
              </p>
            </div>
          )}

          <ComparisonCard
            label="Annual Income"
            baseline={projection.gi_baseline_annual_income_net || 0}
            strategy={projection.gi_strategy_annual_income_net || projection.gi_annual_income_gross || 0}
            tooltip={getAnnualAdvantageTooltip(
              projection.gi_strategy_annual_income_net || projection.gi_annual_income_gross || 0,
              projection.gi_baseline_annual_income_gross || 0,
              client.tax_rate || 24,
              projection.gi_baseline_annual_income_net || 0,
              (projection.gi_strategy_annual_income_net || projection.gi_annual_income_gross || 0) - (projection.gi_baseline_annual_income_net || 0)
            )}
          />
          <ComparisonCard
            label="Lifetime Income"
            baseline={baselineTotalNetIncome}
            strategy={giTotalNet}
            tooltip={{
              title: "LIFETIME INCOME COMPARISON",
              calculations: [
                { label: `Your Total Net Income`, value: toUSD(giTotalNet), highlight: "green" as const },
                { label: `Traditional Net Income`, value: toUSD(baselineTotalNetIncome), highlight: "muted" as const },
                { isSeparator: true, label: "", value: "" },
                { label: "= Lifetime Advantage", value: toUSD(giTotalNet - baselineTotalNetIncome), highlight: "green" as const, isResult: true },
              ],
              explanation: `This is the total income you'll receive from age ${incomeStartAge} to age ${client.end_age}. Strategy income is tax-free; baseline is reduced by taxes each year.`,
            }}
          />
          <ComparisonCard
            label="Taxes Paid"
            baseline={(() => {
              // Baseline: pays tax on GI income every year
              const incomeYears = client.end_age - (incomeStartAge || 70) + 1;
              const annualTax = Math.round((baselineAnnualIncomeGross || 0) * (client.tax_rate / 100));
              return annualTax * incomeYears;
            })()}
            strategy={projection.gi_total_conversion_tax || blueConversionTax}
            invertColor
            tooltip={{
              title: "LIFETIME TAXES PAID",
              calculations: [
                { label: "Strategy: Conversion Tax", value: toUSD(projection.gi_total_conversion_tax || blueConversionTax), highlight: "red" as const },
                { label: "Strategy: Tax on Income", value: "$0 (tax-free)", highlight: "green" as const },
                { isSeparator: true, label: "", value: "" },
                { label: `Baseline: Tax on Income (${client.tax_rate}%)`, value: toUSD(Math.round((baselineAnnualIncomeGross || 0) * (client.tax_rate / 100)) * (client.end_age - (incomeStartAge || 70) + 1)), highlight: "red" as const },
                { isSeparator: true, label: "", value: "" },
                { label: "Tax Savings", value: toUSD(Math.round((baselineAnnualIncomeGross || 0) * (client.tax_rate / 100)) * (client.end_age - (incomeStartAge || 70) + 1) - (projection.gi_total_conversion_tax || blueConversionTax)), highlight: "green" as const, isResult: true },
              ],
              explanation: "Strategy pays conversion tax once upfront, then $0 tax on income forever. Baseline pays tax on every GI payment for life.",
            }}
          />
          <ComparisonCard
            label="Break-Even"
            baseline={0}
            strategy={projection.gi_break_even_years || 0}
            suffix=" years"
            showAsAbsolute
            tooltip={getBreakEvenTooltip(
              projection.gi_total_conversion_tax || blueConversionTax,
              projection.gi_annual_income_advantage || 0,
              projection.gi_break_even_years || 0,
              incomeStartAge || 70
            )}
          />
        </div>

        {/* Section 5: Cumulative Income Chart */}
        <div className="bg-bg-card border border-border-default rounded-[14px] p-7">
          <div className="flex justify-between items-center mb-6">
            <div>
              <p className="text-xs uppercase tracking-[1.5px] text-text-muted font-medium">
                Cumulative Income Received
              </p>
              <p className="text-sm text-text-dim mt-1">
                Total net income in your pocket over time
              </p>
            </div>
            <div className="flex items-center gap-5 text-sm">
              <span className="flex items-center gap-2 text-green">
                <span className="w-4 h-0.5 bg-[#4ade80] rounded" />
                Tax-Free (Strategy)
              </span>
              <span className="flex items-center gap-2 text-text-muted">
                <span className="w-4 h-0.5 rounded" style={{ backgroundImage: "repeating-linear-gradient(90deg, var(--chart-muted-light) 0px, var(--chart-muted-light) 4px, transparent 4px, transparent 6px)" }} />
                After-Tax (Baseline)
              </span>
            </div>
          </div>
          <div className="h-[280px]">
            <GIIncomeChart
              data={incomeChartData}
              breakEvenAge={projection.gi_break_even_age || null}
              incomeStartAge={incomeStartAge || 70}
            />
          </div>
          {/* Chart explanation */}
          <div className="mt-4 pt-4 border-t border-border-default">
            <p className="text-sm text-text-dim">
              The gap between the lines is your <span className="text-green font-medium">Tax-Free Wealth Created</span> — the extra money you keep by having Roth income instead of taxable income.
            </p>
          </div>
        </div>

        {/* Section 6: Roth Conversion Summary (Conditional) */}
        {totalConverted > 0 && (
          <div className="bg-bg-card border border-border-default rounded-[14px] p-7">
            <p className="text-xs uppercase tracking-[1.5px] text-text-muted mb-6 font-medium">
              Roth Conversions (Deferral Period)
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <p className="text-xs text-text-muted mb-1">Total Converted</p>
                <p className="text-xl font-mono font-medium text-gold">{toUSD(totalConverted)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1">Conversion Taxes Paid</p>
                <p className="text-xl font-mono font-medium text-red">{toUSD(blueConversionTax)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1">Final Roth Balance</p>
                <p className="text-xl font-mono font-medium text-green">{toUSD(blueFinalRoth)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1">Tax Bracket Used</p>
                <p className="text-xl font-mono font-medium text-text-dim">{client.tax_rate}%</p>
              </div>
            </div>
          </div>
        )}

        {/* Section 7: Year-by-Year Table (Adjustable Columns) */}
        <div className="bg-bg-card border border-border-default rounded-[14px] overflow-hidden">
          {/* Table Header */}
          <div className="flex justify-between items-center px-6 py-5 border-b border-border-default">
            <p className="text-xs uppercase tracking-[1.5px] text-text-muted font-medium">
              Year-by-Year Projection
            </p>
            <div className="flex bg-bg-input rounded-lg p-1">
              <button
                onClick={() => setTableView("strategy")}
                className={cn(
                  "px-4 py-1.5 text-sm rounded-md transition-colors",
                  tableView === "strategy"
                    ? "bg-gold text-primary-foreground font-medium"
                    : "text-text-muted hover:text-foreground"
                )}
              >
                Strategy
              </button>
              <button
                onClick={() => setTableView("baseline")}
                className={cn(
                  "px-4 py-1.5 text-sm rounded-md transition-colors",
                  tableView === "baseline"
                    ? "bg-gold text-primary-foreground font-medium"
                    : "text-text-muted hover:text-foreground"
                )}
              >
                Baseline
              </button>
            </div>
          </div>

          <div className="px-6 py-5">
            <YearByYearTable
              years={tableView === "strategy" ? projection.blueprint_years : projection.baseline_years}
              scenario={tableView === "strategy" ? "formula" : "baseline"}
              productType="gi"
              nonSsiIncome={client.non_ssi_income}
              clientId={client.id}
            />
          </div>

          {/* Depletion note */}
          {depletionAge && (
            <div className="px-6 py-3 border-t border-border-default bg-[rgba(212,175,55,0.03)]">
              <p className="text-sm text-gold italic">
                Income continues for life after account depletion
              </p>
            </div>
          )}
        </div>

        {/* Section 8: Product Details (Collapsible) */}
        <div>
          <button
            onClick={() => setProductDetailsOpen(!productDetailsOpen)}
            className="w-full flex justify-between items-center py-4 text-left"
          >
            <p className="text-xs uppercase tracking-[1.5px] text-text-muted font-medium">
              Product Details
            </p>
            {productDetailsOpen ? (
              <ChevronUp className="w-4 h-4 text-text-muted" />
            ) : (
              <ChevronDown className="w-4 h-4 text-text-muted" />
            )}
          </button>

          {productDetailsOpen && (
            <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
              <div className="grid grid-cols-2 gap-x-12 gap-y-3">
                <DetailRow label="Carrier" value={client.carrier_name} />
                <DetailRow label="Product" value={client.product_name} />
                <DetailRow label="Premium Bonus" value={`${bonusPercent}% (applied to Income Base)`} />
                <DetailRow label="Rider Fee" value={`${productConfig?.defaults.riderFee || 1.00}%/year`} />
                <DetailRow label="Roll-Up Rate" value={projection.gi_roll_up_description || "N/A"} />
                <DetailRow label="Payout Type" value={payoutTypeDisplay} />
                <DetailRow label="Payout Percentage" value={`${payoutPercent.toFixed(2)}% (age ${incomeStartAge})`} />
                <DetailRow label="Total Rider Fees Paid" value={toUSD(projection.gi_total_rider_fees || 0)} />
                <DetailRow label="Surrender Period" value={`${client.surrender_years} years`} />
              </div>
            </div>
          )}
        </div>

        {/* Section 9: Advanced Analysis */}
        <AdvancedFeaturesSection client={client} chartData={chartData} />

        {/* Section 10: Disclaimer */}
        <p className="text-sm text-text-dim italic text-center max-w-[800px] mx-auto py-6">
          This optimized plan is for educational purposes only. Before making a Roth conversion or purchasing an annuity, discuss your final plan with a tax professional and licensed insurance agent.
        </p>
      </div>
    </div>
  );
}

// Comparison Card Component
function ComparisonCard({
  label,
  baseline,
  strategy,
  invertColor = false,
  showAsAbsolute = false,
  suffix = "",
  tooltip,
}: {
  label: string;
  baseline: number;
  strategy: number;
  invertColor?: boolean;
  showAsAbsolute?: boolean;
  suffix?: string;
  tooltip?: {
    title: string;
    calculations?: Array<{
      label: string;
      value: string;
      highlight?: "gold" | "green" | "red" | "muted";
      isSeparator?: boolean;
      isResult?: boolean;
    }>;
    explanation?: string;
  };
}) {
  const diff = strategy - baseline;
  const pct = baseline !== 0 ? diff / Math.abs(baseline) : 0;
  const isPositive = invertColor ? diff <= 0 : diff >= 0;

  // For absolute display (like break-even years), just show the strategy value
  if (showAsAbsolute) {
    return (
      <div className="bg-bg-card border border-border-default rounded-[12px] p-5 relative">
        {tooltip && (
          <div className="absolute top-3 right-3">
            <InfoTooltip {...tooltip} />
          </div>
        )}
        <p className="text-xs uppercase tracking-[1.5px] text-text-muted mb-4 font-medium">
          {label}
        </p>
        <p className="text-2xl font-mono font-medium text-foreground">
          {suffix ? `${strategy}${suffix}` : toUSD(strategy)}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-bg-card border border-border-default rounded-[12px] p-5 relative">
      {tooltip && (
        <div className="absolute top-3 right-3">
          <InfoTooltip {...tooltip} />
        </div>
      )}
      <p className="text-xs uppercase tracking-[1.5px] text-text-muted mb-4 font-medium">
        {label}
      </p>
      <div className="flex justify-between mb-2">
        <div>
          <p className="text-xs uppercase text-text-dim mb-1">Baseline</p>
          <p className="text-lg font-mono text-text-dim">{toUSD(baseline)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase text-text-dim mb-1">Strategy</p>
          <p className="text-lg font-mono font-medium text-foreground">{toUSD(strategy)}</p>
        </div>
      </div>
      <div className="pt-3 border-t border-border-default">
        <p className={cn(
          "text-base font-mono font-medium",
          isPositive ? "text-green" : "text-red"
        )}>
          {diff >= 0 ? "+" : ""}{toUSD(diff)} ({pct >= 0 ? "+" : ""}{(pct * 100).toFixed(1)}%)
        </p>
      </div>
    </div>
  );
}

// Detail Row Component
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <p className="text-sm text-text-muted">{label}</p>
      <p className="text-sm font-mono text-text-muted">{value}</p>
    </div>
  );
}
