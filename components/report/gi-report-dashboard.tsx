"use client";

import { useState } from "react";
import type { Projection } from "@/lib/types/projection";
import type { Client } from "@/lib/types/client";
import type { YearlyResult } from "@/lib/calculations";
import { WealthChart } from "@/components/results/wealth-chart";
import { transformToGIChartData } from "@/lib/calculations/transforms";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALL_PRODUCTS, type FormulaType } from "@/lib/config/products";

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
  const [tableView, setTableView] = useState<"income" | "full">("income");
  const [productDetailsOpen, setProductDetailsOpen] = useState(false);

  const chartData = transformToGIChartData(projection);
  const heirTaxRate = (client.heir_tax_rate ?? 40) / 100;

  // Calculate break-even from chart data (lifetime wealth trajectory, not raw netWorth)
  const chartBreakEvenAge = chartData.find(d => d.formula > d.baseline)?.age ?? null;

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

  // Baseline calculations
  // Note: Taxes and IRMAA are already deducted from taxableBalance in the engine
  const baseRMDs = sum(projection.baseline_years, "rmdAmount");
  const baseTax = sum(projection.baseline_years, "federalTax") + sum(projection.baseline_years, "stateTax");
  const baseIrmaa = sum(projection.baseline_years, "irmaaSurcharge");
  const baseFinalTraditional = projection.baseline_final_traditional;
  const baseFinalRoth = projection.baseline_final_roth;
  // Heir tax only applies to traditional IRA portion
  const baseHeirTax = Math.round(baseFinalTraditional * heirTaxRate);
  // Net legacy = final net worth (includes taxable) minus heir taxes on traditional
  const baseNetLegacy = projection.baseline_final_net_worth - baseHeirTax;
  // Lifetime wealth = net legacy (taxes/IRMAA already deducted from taxable in engine)
  const baseLifetimeWealth = baseNetLegacy;

  // Formula (GI) calculations
  let blueConversionTax = 0;
  let totalConverted = 0;
  projection.blueprint_years.forEach((year, i) => {
    const giYear = giYearlyData[i];
    if (giYear && giYear.phase === "deferral") {
      blueConversionTax += (year.federalTax + year.stateTax) || 0;
      totalConverted += year.conversionAmount || 0;
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
        {/* Section 1: The Guarantee (Hero Card) */}
        <div className="bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.2)] rounded-[16px] py-10 px-12 text-center">
          <p className="text-sm uppercase tracking-[3px] text-[rgba(212,175,55,0.7)] mb-2 font-medium">
            Your Guaranteed Lifetime Income
          </p>
          <div className="w-16 h-[2px] bg-gold mx-auto mb-6" />
          <p className="text-5xl font-mono font-semibold text-gold mb-1">
            {toUSD(projection.gi_annual_income_gross || 0)}/year
          </p>
          <p className="text-lg font-display text-white mb-5">for life</p>
          <p className="text-base text-[rgba(255,255,255,0.6)]">
            After taxes: {toUSD(projection.gi_annual_income_net || 0)}/year · Starting age {incomeStartAge}
          </p>
          <p className="text-sm text-[rgba(255,255,255,0.4)] mt-1">
            {payoutTypeDisplay} · {payoutPercent.toFixed(2)}% payout rate
          </p>
        </div>

        {/* Section 2: Income Base Journey */}
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
            <div className="bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.2)] rounded-[10px] py-4 px-5 text-center min-w-[130px]">
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
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-7">
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
          <ComparisonCard
            label="Lifetime Income"
            baseline={baseAfterTaxDist}
            strategy={giTotalNet}
          />
          <ComparisonCard
            label="Net Legacy"
            baseline={baseNetLegacy}
            strategy={blueNetLegacy}
          />
          <ComparisonCard
            label="Total Taxes Paid"
            baseline={baseTax + Math.round(baseFinalTraditional * heirTaxRate)}
            strategy={blueConversionTax + giTaxOnPayments + Math.round(blueFinalTraditional * heirTaxRate)}
            invertColor
          />
          <ComparisonCard
            label="Lifetime Wealth"
            baseline={baseLifetimeWealth}
            strategy={blueLifetimeWealth}
          />
        </div>

        {/* Section 5: Wealth Trajectory Chart */}
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-7">
          <div className="flex justify-between items-center mb-6">
            <p className="text-xs uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] font-medium">
              Wealth Over Time
            </p>
            <div className="flex items-center gap-5 text-sm">
              <span className="flex items-center gap-2 text-gold">
                <span className="w-4 h-0.5 bg-gold rounded" />
                Strategy
              </span>
              <span className="flex items-center gap-2 text-[rgba(255,255,255,0.5)]">
                <span className="w-4 h-0.5 rounded" style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 4px, transparent 4px, transparent 6px)" }} />
                Baseline
              </span>
            </div>
          </div>
          <div className="h-[240px]">
            <WealthChart data={chartData} breakEvenAge={chartBreakEvenAge} />
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
                onClick={() => setTableView("income")}
                className={cn(
                  "px-4 py-1.5 text-sm rounded-md transition-colors",
                  tableView === "income"
                    ? "bg-gold text-[#0c0c0c] font-medium"
                    : "text-[rgba(255,255,255,0.5)] hover:text-white"
                )}
              >
                Income View
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
                Full Details
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
                  {tableView === "full" && (
                    <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Income Base</th>
                  )}
                  <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Guaranteed Income</th>
                  {tableView === "full" && (
                    <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Rider Fee</th>
                  )}
                  <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Taxes</th>
                  <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Net Income</th>
                  <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Cumulative</th>
                  <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Account Value</th>
                  {tableView === "full" && (
                    <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Roth Balance</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {giYearlyData.map((row, idx) => {
                  const blueprintYear = projection.blueprint_years[idx];
                  const isDepletionRow = depletionAge && row.age === depletionAge && row.accountValue <= 0;
                  const isAccountZero = row.accountValue <= 0;

                  // Calculate cumulative income up to this row
                  let cumulative = 0;
                  for (let i = 0; i <= idx; i++) {
                    cumulative += giYearlyData[i].guaranteedIncomeNet;
                  }

                  return (
                    <tr
                      key={row.year}
                      className={cn(
                        "border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] transition-colors",
                        isDepletionRow && "bg-[rgba(212,175,55,0.03)] border-l-[3px] border-l-gold"
                      )}
                    >
                      <td className="px-4 py-3 text-sm font-mono text-[rgba(255,255,255,0.6)]">{row.year}</td>
                      <td className="px-4 py-3 text-sm text-[rgba(255,255,255,0.5)]">{row.age}</td>
                      {tableView === "full" && (
                        <td className={cn(
                          "px-4 py-3 text-sm font-mono text-right",
                          row.phase === "deferral" ? "text-gold" : "text-[rgba(255,255,255,0.5)]"
                        )}>
                          {toUSD(row.incomeBase)}
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm font-mono text-right text-gold">
                        {row.guaranteedIncomeGross > 0 ? toUSD(row.guaranteedIncomeGross) : "—"}
                      </td>
                      {tableView === "full" && (
                        <td className="px-4 py-3 text-sm font-mono text-right text-[rgba(255,255,255,0.4)]">
                          {row.riderFee > 0 ? toUSD(row.riderFee) : "—"}
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm font-mono text-right text-[#f87171]">
                        {blueprintYear ? toUSD(blueprintYear.federalTax + blueprintYear.stateTax) : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-right text-[#4ade80]">
                        {row.guaranteedIncomeNet > 0 ? toUSD(row.guaranteedIncomeNet) : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-right text-[rgba(255,255,255,0.5)]">
                        {cumulative > 0 ? toUSD(cumulative) : "—"}
                      </td>
                      <td className={cn(
                        "px-4 py-3 text-sm font-mono text-right",
                        isAccountZero ? "text-[rgba(255,255,255,0.25)]" : "text-[rgba(255,255,255,0.5)]"
                      )}>
                        {isAccountZero ? "—" : toUSD(row.accountValue)}
                      </td>
                      {tableView === "full" && (
                        <td className={cn(
                          "px-4 py-3 text-sm font-mono text-right",
                          blueprintYear?.rothBalance && blueprintYear.rothBalance > 0 ? "text-[#4ade80]" : "text-[rgba(255,255,255,0.25)]"
                        )}>
                          {blueprintYear?.rothBalance && blueprintYear.rothBalance > 0 ? toUSD(blueprintYear.rothBalance) : "—"}
                        </td>
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
}: {
  label: string;
  baseline: number;
  strategy: number;
  invertColor?: boolean;
}) {
  const diff = strategy - baseline;
  const pct = baseline !== 0 ? diff / Math.abs(baseline) : 0;
  const isPositive = invertColor ? diff <= 0 : diff >= 0;

  return (
    <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[12px] p-5">
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
