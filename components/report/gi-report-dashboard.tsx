"use client";

import { useState } from "react";
import type { Projection } from "@/lib/types/projection";
import type { Client } from "@/lib/types/client";
import type { YearlyResult } from "@/lib/calculations";
import { GIIncomeChart } from "@/components/results/gi-income-chart";
import { transformToGIIncomeChartData } from "@/lib/calculations/transforms";
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
  const [tableView, setTableView] = useState<"summary" | "full" | "baseline">("summary");
  const [productDetailsOpen, setProductDetailsOpen] = useState(false);

  const incomeChartData = transformToGIIncomeChartData(projection);
  const heirTaxRate = (client.heir_tax_rate ?? 40) / 100;

  // Get product config
  const productConfig = ALL_PRODUCTS[client.blueprint_type as FormulaType];

  // ===== Calculate metrics =====
  const giYearlyData = projection.gi_yearly_data || [];

  // Income Base Journey values
  const deposit = client.qualified_account_value;
  const bonusPercent = client.bonus_percent || 0;
  const bonusAmount = Math.round(deposit * (bonusPercent / 100));
  const startingIncomeBase = projection.gi_income_base_at_start || (deposit + bonusAmount);
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
    const incomeYears = client.end_age - (projection.gi_income_start_age || client.income_start_age || 70);
    baselineTotalNetIncome = projection.gi_baseline_annual_income_net * incomeYears;
  }

  // Heir tax only applies to traditional IRA portion (the GI account value)
  const baseHeirTax = Math.round(baseFinalTraditional * heirTaxRate);
  // Net legacy = final account value minus heir taxes
  const baseNetLegacy = projection.baseline_final_net_worth - baseHeirTax;
  // Lifetime wealth = net legacy + lifetime income received
  const baseLifetimeWealth = baseNetLegacy + baselineTotalNetIncome;

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
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-9 space-y-6">
        {/* Section 1: The Guarantee (Hero Card) - Tax-Free Roth GI Income */}
        <div className="bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.2)] rounded-[16px] py-10 px-12 text-center relative">
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
          <p className="text-lg font-display text-white mb-3">tax-free for life</p>

          {/* Comparison with baseline taxable income */}
          {projection.gi_baseline_annual_income_net && (
            <div className="bg-[rgba(0,0,0,0.2)] rounded-lg py-3 px-6 inline-block mb-4">
              <p className="text-sm text-[rgba(255,255,255,0.6)]">
                vs. Traditional GI: {toUSD(projection.gi_baseline_annual_income_gross || 0)}/year gross
                → <span className="text-[#f87171]">{toUSD(projection.gi_baseline_annual_income_net)}/year after tax</span>
              </p>
            </div>
          )}

          <p className="text-base text-[rgba(255,255,255,0.6)]">
            Starting age {incomeStartAge} · {payoutTypeDisplay} · {payoutPercent.toFixed(2)}% payout rate
          </p>
          {projection.gi_annual_income_advantage && projection.gi_annual_income_advantage > 0 && (
            <p className="text-base text-[#4ade80] mt-2 font-medium">
              +{toUSD(projection.gi_annual_income_advantage)}/year advantage over traditional
            </p>
          )}
        </div>

        {/* Section 2: 4-Phase Journey */}
        {projection.gi_conversion_phase_years && projection.gi_conversion_phase_years > 0 && (
          <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-7">
            <p className="text-xs uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] mb-6 font-medium">
              Your Tax-Free Income Journey
            </p>

            {/* 4-Phase Timeline */}
            <div className="flex items-stretch gap-3 mb-6 overflow-x-auto pb-2">
              {/* Phase 1: Conversion */}
              <div className="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-[10px] p-5 min-w-[180px] flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-[rgba(212,175,55,0.15)] flex items-center justify-center text-gold text-sm font-bold">1</div>
                  <p className="text-sm font-medium text-gold uppercase tracking-wide">Convert</p>
                </div>
                <p className="text-2xl font-mono font-medium text-white mb-1">
                  {projection.gi_conversion_phase_years} years
                </p>
                <p className="text-xs text-[rgba(255,255,255,0.5)] mb-2">Traditional → Roth IRA</p>
                <p className="text-sm font-mono text-[#f87171]">
                  Tax: {toUSD(projection.gi_total_conversion_tax || 0)}
                </p>
              </div>

              <div className="flex items-center">
                <ArrowRight className="w-5 h-5 text-[rgba(255,255,255,0.3)]" />
              </div>

              {/* Phase 2: Purchase */}
              <div className="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-[10px] p-5 min-w-[180px] flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-[rgba(212,175,55,0.15)] flex items-center justify-center text-gold text-sm font-bold">2</div>
                  <p className="text-sm font-medium text-gold uppercase tracking-wide">Purchase</p>
                </div>
                <p className="text-2xl font-mono font-medium text-white mb-1">
                  Age {projection.gi_purchase_age}
                </p>
                <p className="text-xs text-[rgba(255,255,255,0.5)] mb-2">Buy GI in Roth IRA</p>
                <p className="text-sm font-mono text-[#4ade80]">
                  {toUSD(projection.gi_purchase_amount || 0)}
                </p>
              </div>

              <div className="flex items-center">
                <ArrowRight className="w-5 h-5 text-[rgba(255,255,255,0.3)]" />
              </div>

              {/* Phase 3: Grow (Deferral) */}
              <div className="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-[10px] p-5 min-w-[180px] flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-[rgba(212,175,55,0.15)] flex items-center justify-center text-gold text-sm font-bold">3</div>
                  <p className="text-sm font-medium text-gold uppercase tracking-wide">Grow</p>
                </div>
                <p className="text-2xl font-mono font-medium text-white mb-1">
                  {projection.gi_deferral_years || 0} years
                </p>
                <p className="text-xs text-[rgba(255,255,255,0.5)] mb-2">Income Base grows</p>
                <p className="text-sm font-mono text-gold">
                  +{toUSD(rollUpGrowth)}
                </p>
              </div>

              <div className="flex items-center">
                <ArrowRight className="w-5 h-5 text-[rgba(255,255,255,0.3)]" />
              </div>

              {/* Phase 4: Income */}
              <div className="bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.2)] rounded-[10px] p-5 min-w-[180px] flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-[rgba(212,175,55,0.25)] flex items-center justify-center text-gold text-sm font-bold">4</div>
                  <p className="text-sm font-medium text-gold uppercase tracking-wide">Income</p>
                </div>
                <p className="text-2xl font-mono font-semibold text-gold mb-1">
                  For Life
                </p>
                <p className="text-xs text-[rgba(212,175,55,0.7)] mb-2">Tax-free payments</p>
                <p className="text-sm font-mono text-[#4ade80]">
                  {toUSD(projection.gi_strategy_annual_income_net || projection.gi_annual_income_gross || 0)}/yr
                </p>
              </div>
            </div>

            {/* Break-even callout */}
            {projection.gi_break_even_years && projection.gi_break_even_age && (
              <div className="bg-[rgba(74,222,128,0.05)] border border-[rgba(74,222,128,0.15)] rounded-lg p-4 text-center">
                <p className="text-sm text-[#4ade80]">
                  <span className="font-semibold">Break-even at age {projection.gi_break_even_age}</span>
                  {" "}({projection.gi_break_even_years} years after income starts) — then pure tax-free advantage
                </p>
              </div>
            )}
          </div>
        )}

        {/* Section 3: Income Base Journey */}
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-7">
          <p className="text-xs uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] mb-6 font-medium">
            How Your Income Is Calculated
          </p>

          {/* Journey Flow */}
          <div className="flex items-center justify-between gap-3 mb-6 overflow-x-auto pb-2">
            {/* Step 1: Deposit */}
            <div className="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-[10px] py-4 px-5 text-center min-w-[130px]">
              <p className="text-xl font-mono font-medium text-white">{toUSD(deposit)}</p>
              <p className="text-sm text-[rgba(255,255,255,0.5)] mt-1">Deposit</p>
            </div>

            <span className="text-xl text-[rgba(255,255,255,0.3)]">→</span>

            {/* Step 2: Bonus */}
            <div className="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-[10px] py-4 px-5 text-center min-w-[130px]">
              <p className="text-xl font-mono font-medium text-gold">+{toUSD(bonusAmount)}</p>
              <p className="text-sm text-[rgba(255,255,255,0.5)] mt-1">{bonusPercent}% Bonus</p>
            </div>

            <span className="text-xl text-[rgba(255,255,255,0.3)]">→</span>

            {/* Step 3: Starting Income Base */}
            <div className="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-[10px] py-4 px-5 text-center min-w-[130px]">
              <p className="text-xl font-mono font-medium text-white">{toUSD(startingIncomeBase)}</p>
              <p className="text-sm text-[rgba(255,255,255,0.5)] mt-1">Starting Income Base</p>
            </div>

            <span className="text-xl text-[rgba(255,255,255,0.3)]">→</span>

            {/* Step 4: Roll-Up Growth */}
            <div className="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-[10px] py-4 px-5 text-center min-w-[130px]">
              <p className="text-xl font-mono font-medium text-gold">+{toUSD(rollUpGrowth)}</p>
              <p className="text-sm text-[rgba(255,255,255,0.5)] mt-1">Roll-Up Growth</p>
            </div>

            <span className="text-xl text-[rgba(255,255,255,0.3)]">→</span>

            {/* Step 5: Final Income Base */}
            <div className="bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.2)] rounded-[10px] py-4 px-5 text-center min-w-[130px] relative">
              <div className="absolute top-1 right-1">
                <InfoTooltip
                  {...getFinalIncomeBaseTooltip(
                    projection.gi_purchase_amount || deposit,
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
          <div className="pt-5 border-t border-[rgba(255,255,255,0.07)]">
            <p className="text-base font-mono text-[rgba(255,255,255,0.6)]">
              {toUSD(finalIncomeBase)} × {payoutPercent.toFixed(2)}% = <span className="text-gold font-semibold">{toUSD(calculatedIncome)}/year guaranteed</span>
            </p>
          </div>
        </div>

        {/* Section 3: The Protection Promise */}
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-7 relative">
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
          <p className="text-xs uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] mb-5 font-medium">
            The Guarantee
          </p>

          {depletionAge && (
            <p className="text-base text-[rgba(255,255,255,0.6)] mb-5">
              Your Account Value is projected to deplete at age {depletionAge}.
            </p>
          )}

          {/* Checkmarks */}
          <div className="space-y-3 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-[rgba(74,222,128,0.1)] flex items-center justify-center shrink-0">
                <Check className="w-4 h-4 text-[#4ade80]" />
              </div>
              <p className="text-base text-white">
                Your guaranteed income of {toUSD(projection.gi_annual_income_gross || 0)}/year continues for life
              </p>
            </div>
            {depletionAge && cumulativeAtDepletion > 0 && (
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-[rgba(74,222,128,0.1)] flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4 text-[#4ade80]" />
                </div>
                <p className="text-base text-white">
                  You will have received {toUSD(cumulativeAtDepletion)} in income by age {depletionAge}
                </p>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-[rgba(74,222,128,0.1)] flex items-center justify-center shrink-0">
                <Check className="w-4 h-4 text-[#4ade80]" />
              </div>
              <p className="text-base text-white">
                Total projected lifetime income: {toUSD(giTotalGross)} (to age {client.end_age})
              </p>
            </div>
          </div>

          {/* Comparison Callout */}
          <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.07)] rounded-[10px] p-5">
            <p className="text-sm text-[rgba(255,255,255,0.4)] italic">
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
                    client.end_age - (incomeStartAge || 70)
                  )}
                />
              </div>
              <p className="text-xs uppercase tracking-[1.5px] text-[rgba(74,222,128,0.7)] mb-2 font-medium">
                Tax-Free Wealth Created
              </p>
              <p className="text-4xl font-mono font-semibold text-[#4ade80] mb-2">
                +{toUSD(projection.gi_tax_free_wealth_created)}
              </p>
              <p className="text-sm text-[rgba(255,255,255,0.5)]">
                Lifetime advantage over Traditional GI
                {projection.gi_percent_improvement && (
                  <span className="text-[#4ade80] ml-2">
                    (+{projection.gi_percent_improvement.toFixed(1)}% improvement)
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
              const incomeYears = client.end_age - (incomeStartAge || 70);
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
                { label: `Baseline: Tax on Income (${client.tax_rate}%)`, value: toUSD(Math.round((baselineAnnualIncomeGross || 0) * (client.tax_rate / 100)) * (client.end_age - (incomeStartAge || 70))), highlight: "red" as const },
                { isSeparator: true, label: "", value: "" },
                { label: "Tax Savings", value: toUSD(Math.round((baselineAnnualIncomeGross || 0) * (client.tax_rate / 100)) * (client.end_age - (incomeStartAge || 70)) - (projection.gi_total_conversion_tax || blueConversionTax)), highlight: "green" as const, isResult: true },
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
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-7">
          <div className="flex justify-between items-center mb-6">
            <div>
              <p className="text-xs uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] font-medium">
                Cumulative Income Received
              </p>
              <p className="text-sm text-[rgba(255,255,255,0.4)] mt-1">
                Total net income in your pocket over time
              </p>
            </div>
            <div className="flex items-center gap-5 text-sm">
              <span className="flex items-center gap-2 text-[#4ade80]">
                <span className="w-4 h-0.5 bg-[#4ade80] rounded" />
                Tax-Free (Strategy)
              </span>
              <span className="flex items-center gap-2 text-[rgba(255,255,255,0.5)]">
                <span className="w-4 h-0.5 rounded" style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,0.4) 0px, rgba(255,255,255,0.4) 4px, transparent 4px, transparent 6px)" }} />
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
          <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.07)]">
            <p className="text-sm text-[rgba(255,255,255,0.4)]">
              The gap between the lines is your <span className="text-[#4ade80] font-medium">Tax-Free Wealth Created</span> — the extra money you keep by having Roth income instead of taxable income.
            </p>
          </div>
        </div>

        {/* Section 6: Roth Conversion Summary (Conditional) */}
        {totalConverted > 0 && (
          <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-7">
            <p className="text-xs uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] mb-6 font-medium">
              Roth Conversions (Deferral Period)
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <p className="text-xs text-[rgba(255,255,255,0.5)] mb-1">Total Converted</p>
                <p className="text-xl font-mono font-medium text-gold">{toUSD(totalConverted)}</p>
              </div>
              <div>
                <p className="text-xs text-[rgba(255,255,255,0.5)] mb-1">Conversion Taxes Paid</p>
                <p className="text-xl font-mono font-medium text-[#f87171]">{toUSD(blueConversionTax)}</p>
              </div>
              <div>
                <p className="text-xs text-[rgba(255,255,255,0.5)] mb-1">Final Roth Balance</p>
                <p className="text-xl font-mono font-medium text-[#4ade80]">{toUSD(blueFinalRoth)}</p>
              </div>
              <div>
                <p className="text-xs text-[rgba(255,255,255,0.5)] mb-1">Tax Bracket Used</p>
                <p className="text-xl font-mono font-medium text-[rgba(255,255,255,0.6)]">{client.tax_rate}%</p>
              </div>
            </div>
          </div>
        )}

        {/* Section 7: Year-by-Year Table */}
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] overflow-hidden">
          {/* Table Header */}
          <div className="flex justify-between items-center px-6 py-5 border-b border-[rgba(255,255,255,0.07)]">
            <p className="text-xs uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] font-medium">
              Year-by-Year Projection
            </p>
            <div className="flex bg-[rgba(255,255,255,0.04)] rounded-lg p-1">
              <button
                onClick={() => setTableView("summary")}
                className={cn(
                  "px-4 py-1.5 text-sm rounded-md transition-colors",
                  tableView === "summary"
                    ? "bg-gold text-[#0c0c0c] font-medium"
                    : "text-[rgba(255,255,255,0.5)] hover:text-white"
                )}
              >
                Summary
              </button>
              <button
                onClick={() => setTableView("full")}
                className={cn(
                  "px-4 py-1.5 text-sm rounded-md transition-colors",
                  tableView === "full"
                    ? "bg-gold text-[#0c0c0c] font-medium"
                    : "text-[rgba(255,255,255,0.5)] hover:text-white"
                )}
              >
                Strategy
              </button>
              <button
                onClick={() => setTableView("baseline")}
                className={cn(
                  "px-4 py-1.5 text-sm rounded-md transition-colors",
                  tableView === "baseline"
                    ? "bg-gold text-[#0c0c0c] font-medium"
                    : "text-[rgba(255,255,255,0.5)] hover:text-white"
                )}
              >
                Baseline
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[rgba(255,255,255,0.02)]">
                  <th className="text-left px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Year</th>
                  <th className="text-left px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Age</th>
                  <th className="text-left px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Phase</th>

                  {/* Strategy (Full) columns */}
                  {tableView === "full" && (
                    <>
                      <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Trad (BOY)</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Conversion</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Conv. Tax</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Trad (EOY)</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Roth (EOY)</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Income Base</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Acct Value</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Rider Fee</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">GI Income</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Net</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Cumulative</th>
                    </>
                  )}

                  {/* Summary columns */}
                  {tableView === "summary" && (
                    <>
                      <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Key Value</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">GI Income</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Taxes</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Net</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Cumulative</th>
                    </>
                  )}

                  {/* Baseline columns - Traditional GI scenario */}
                  {tableView === "baseline" && (
                    <>
                      <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Income Base</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Acct Value</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">GI Income</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Tax ({client.tax_rate}%)</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Net Income</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Cumulative</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {/* BASELINE VIEW - Show baseline scenario data */}
                {tableView === "baseline" && baselineGIYearlyData.map((row, idx) => {
                  const isDeferralPhase = row.phase === "deferral";
                  const isIncomePhase = row.phase === "income";
                  const isAccountZero = row.accountValue <= 0;

                  // Calculate tax on this year's income using flat rate (consistent with chart)
                  const grossIncome = row.guaranteedIncomeGross || 0;
                  const taxOnIncome = isIncomePhase ? Math.round(grossIncome * (client.tax_rate / 100)) : 0;
                  const netIncome = grossIncome - taxOnIncome;

                  // Calculate cumulative net income using flat rate (must match chart)
                  let cumulative = 0;
                  for (let i = 0; i <= idx; i++) {
                    const yearGross = baselineGIYearlyData[i].guaranteedIncomeGross || 0;
                    const yearIsIncome = baselineGIYearlyData[i].phase === "income";
                    const yearTax = yearIsIncome ? Math.round(yearGross * (client.tax_rate / 100)) : 0;
                    cumulative += yearGross - yearTax;
                  }

                  // Phase display for baseline
                  const phaseLabel = isDeferralPhase ? "Grow" : isIncomePhase ? "Income" : row.phase;
                  const phaseColor = isDeferralPhase ? "text-[#3b82f6]" : isIncomePhase ? "text-[rgba(255,255,255,0.5)]" : "text-[rgba(255,255,255,0.5)]";

                  return (
                    <tr
                      key={row.year}
                      className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                    >
                      <td className="px-4 py-3 text-sm font-mono text-[rgba(255,255,255,0.6)]">{row.year}</td>
                      <td className="px-4 py-3 text-sm text-[rgba(255,255,255,0.5)]">{row.age}</td>
                      <td className={cn("px-4 py-3 text-sm font-medium uppercase tracking-wide", phaseColor)}>
                        {phaseLabel}
                      </td>
                      <td className={cn(
                        "px-4 py-3 text-sm font-mono text-right",
                        isDeferralPhase ? "text-gold" : "text-[rgba(255,255,255,0.5)]"
                      )}>
                        {row.incomeBase > 0 ? toUSD(row.incomeBase) : "—"}
                      </td>
                      <td className={cn(
                        "px-4 py-3 text-sm font-mono text-right",
                        isAccountZero ? "text-[rgba(255,255,255,0.25)]" : "text-[rgba(255,255,255,0.5)]"
                      )}>
                        {isAccountZero ? "$0" : toUSD(row.accountValue)}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-right text-[rgba(255,255,255,0.6)]">
                        {grossIncome > 0 ? toUSD(grossIncome) : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-right text-[#f87171]">
                        {taxOnIncome > 0 ? toUSD(taxOnIncome) : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-right text-[rgba(255,255,255,0.5)]">
                        {netIncome > 0 ? toUSD(netIncome) : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-right text-[rgba(255,255,255,0.5)]">
                        {cumulative > 0 ? toUSD(cumulative) : "—"}
                      </td>
                    </tr>
                  );
                })}

                {/* STRATEGY VIEWS (Summary & Full) - Show strategy scenario data */}
                {tableView !== "baseline" && giYearlyData.map((row, idx) => {
                  const blueprintYear = projection.blueprint_years[idx];
                  const isDepletionRow = depletionAge && row.age === depletionAge && row.accountValue <= 0;
                  const isAccountZero = row.accountValue <= 0;
                  const isConversionPhase = row.phase === "conversion";
                  const isPurchasePhase = row.phase === "purchase";
                  const isDeferralPhase = row.phase === "deferral";
                  const isIncomePhase = row.phase === "income";

                  // Calculate cumulative income up to this row
                  let cumulative = 0;
                  for (let i = 0; i <= idx; i++) {
                    cumulative += giYearlyData[i].guaranteedIncomeNet;
                  }

                  // Get previous row for BOY values
                  const prevRow = idx > 0 ? giYearlyData[idx - 1] : null;
                  const boyTraditional = prevRow ? prevRow.traditionalBalance : (isConversionPhase ? client.qualified_account_value : 0);
                  const eoyTraditional = row.traditionalBalance;

                  // Key value based on phase (for summary view)
                  const keyValue = isConversionPhase
                    ? row.traditionalBalance
                    : isDeferralPhase || isIncomePhase
                      ? row.incomeBase
                      : row.accountValue;

                  // Phase display
                  const phaseLabel = {
                    conversion: "Convert",
                    purchase: "Purchase",
                    deferral: "Grow",
                    income: "Income",
                  }[row.phase] || row.phase;

                  const phaseColor = {
                    conversion: "text-[#f97316]",
                    purchase: "text-[#a855f7]",
                    deferral: "text-[#3b82f6]",
                    income: "text-[#4ade80]",
                  }[row.phase] || "text-[rgba(255,255,255,0.5)]";

                  return (
                    <tr
                      key={row.year}
                      className={cn(
                        "border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] transition-colors",
                        isDepletionRow && "bg-[rgba(212,175,55,0.03)] border-l-[3px] border-l-gold",
                        isPurchasePhase && "bg-[rgba(168,85,247,0.05)]"
                      )}
                    >
                      <td className="px-4 py-3 text-sm font-mono text-[rgba(255,255,255,0.6)]">{row.year}</td>
                      <td className="px-4 py-3 text-sm text-[rgba(255,255,255,0.5)]">{row.age}</td>
                      <td className={cn("px-4 py-3 text-sm font-medium uppercase tracking-wide", phaseColor)}>
                        {phaseLabel}
                      </td>

                      {/* Strategy (Full) columns */}
                      {tableView === "full" && (
                        <>
                          <td className="px-4 py-3 text-sm font-mono text-right text-[rgba(255,255,255,0.5)]">
                            {isConversionPhase && boyTraditional > 0 ? toUSD(boyTraditional) : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-right text-gold">
                            {row.conversionAmount > 0 ? toUSD(row.conversionAmount) : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-right text-[#f87171]">
                            {row.conversionTax > 0 ? toUSD(row.conversionTax) : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-right text-[rgba(255,255,255,0.5)]">
                            {isConversionPhase && eoyTraditional > 0 ? toUSD(eoyTraditional) : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-right text-[#4ade80]">
                            {row.rothBalance > 0 ? toUSD(row.rothBalance) : "—"}
                          </td>
                          <td className={cn(
                            "px-4 py-3 text-sm font-mono text-right",
                            (isDeferralPhase || isIncomePhase) ? "text-gold" : "text-[rgba(255,255,255,0.5)]"
                          )}>
                            {row.incomeBase > 0 ? toUSD(row.incomeBase) : "—"}
                          </td>
                          <td className={cn(
                            "px-4 py-3 text-sm font-mono text-right",
                            isAccountZero ? "text-[rgba(255,255,255,0.25)]" : "text-[rgba(255,255,255,0.5)]"
                          )}>
                            {(isConversionPhase || isPurchasePhase) ? "—" : (isAccountZero ? "$0" : toUSD(row.accountValue))}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-right text-[rgba(255,255,255,0.4)]">
                            {row.riderFee > 0 ? toUSD(row.riderFee) : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-right text-gold">
                            {row.guaranteedIncomeGross > 0 ? toUSD(row.guaranteedIncomeGross) : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-right text-[#4ade80]">
                            {row.guaranteedIncomeNet > 0 ? toUSD(row.guaranteedIncomeNet) : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-right text-[rgba(255,255,255,0.5)]">
                            {cumulative > 0 ? toUSD(cumulative) : "—"}
                          </td>
                        </>
                      )}

                      {/* Summary columns */}
                      {tableView === "summary" && (
                        <>
                          <td className={cn(
                            "px-4 py-3 text-sm font-mono text-right",
                            isIncomePhase ? "text-gold" : "text-[rgba(255,255,255,0.5)]"
                          )}>
                            {keyValue > 0 ? toUSD(keyValue) : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-right text-gold">
                            {row.guaranteedIncomeGross > 0 ? toUSD(row.guaranteedIncomeGross) : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-right text-[#f87171]">
                            {(row.conversionTax > 0 || (blueprintYear && (blueprintYear.federalTax + blueprintYear.stateTax) > 0))
                              ? toUSD(row.conversionTax || (blueprintYear?.federalTax || 0) + (blueprintYear?.stateTax || 0))
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-right text-[#4ade80]">
                            {row.guaranteedIncomeNet > 0 ? toUSD(row.guaranteedIncomeNet) : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-right text-[rgba(255,255,255,0.5)]">
                            {cumulative > 0 ? toUSD(cumulative) : "—"}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Depletion note */}
          {depletionAge && (
            <div className="px-6 py-3 border-t border-[rgba(255,255,255,0.07)] bg-[rgba(212,175,55,0.03)]">
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
            <p className="text-xs uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] font-medium">
              Product Details
            </p>
            {productDetailsOpen ? (
              <ChevronUp className="w-4 h-4 text-[rgba(255,255,255,0.5)]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[rgba(255,255,255,0.5)]" />
            )}
          </button>

          {productDetailsOpen && (
            <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-6">
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

        {/* Section 9: Disclaimer */}
        <p className="text-sm text-[rgba(255,255,255,0.4)] italic text-center max-w-[800px] mx-auto py-6">
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
      <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[12px] p-5 relative">
        {tooltip && (
          <div className="absolute top-3 right-3">
            <InfoTooltip {...tooltip} />
          </div>
        )}
        <p className="text-xs uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] mb-4 font-medium">
          {label}
        </p>
        <p className="text-2xl font-mono font-medium text-white">
          {suffix ? `${strategy}${suffix}` : toUSD(strategy)}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[12px] p-5 relative">
      {tooltip && (
        <div className="absolute top-3 right-3">
          <InfoTooltip {...tooltip} />
        </div>
      )}
      <p className="text-xs uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] mb-4 font-medium">
        {label}
      </p>
      <div className="flex justify-between mb-2">
        <div>
          <p className="text-[10px] uppercase text-[rgba(255,255,255,0.35)] mb-1">Baseline</p>
          <p className="text-lg font-mono text-[rgba(255,255,255,0.6)]">{toUSD(baseline)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase text-[rgba(255,255,255,0.35)] mb-1">Strategy</p>
          <p className="text-lg font-mono font-medium text-white">{toUSD(strategy)}</p>
        </div>
      </div>
      <div className="pt-3 border-t border-[rgba(255,255,255,0.07)]">
        <p className={cn(
          "text-base font-mono font-medium",
          isPositive ? "text-[#4ade80]" : "text-[#f87171]"
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
      <p className="text-sm text-[rgba(255,255,255,0.5)]">{label}</p>
      <p className="text-sm font-mono text-[rgba(255,255,255,0.7)]">{value}</p>
    </div>
  );
}
