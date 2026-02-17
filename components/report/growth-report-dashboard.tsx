"use client";

import { useState, ReactNode } from "react";
import type { Projection } from "@/lib/types/projection";
import type { Client } from "@/lib/types/client";
import type { YearlyResult } from "@/lib/calculations";
import { WealthChart } from "@/components/results/wealth-chart";
import { transformToChartData } from "@/lib/calculations/transforms";
import { ChevronDown, ChevronUp, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALL_PRODUCTS, type FormulaType } from "@/lib/config/products";

interface GrowthReportDashboardProps {
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

export function GrowthReportDashboard({ client, projection }: GrowthReportDashboardProps) {
  const [tableView, setTableView] = useState<"strategy" | "baseline" | "comparison">("strategy");
  const [productDetailsOpen, setProductDetailsOpen] = useState(false);

  const chartData = transformToChartData(projection);
  const heirTaxRate = (client.heir_tax_rate ?? 40) / 100;

  // Calculate break-even from chart data (lifetime wealth trajectory, not raw netWorth)
  const chartBreakEvenAge = chartData.find(d => d.formula > d.baseline)?.age ?? null;

  // Get product config
  const productConfig = ALL_PRODUCTS[client.blueprint_type as FormulaType];

  // ===== Calculate metrics =====

  // RMD treatment option affects how we calculate lifetime wealth
  const rmdTreatment = client.rmd_treatment ?? 'reinvested';

  // Baseline calculations
  // Note: Taxes and IRMAA are already deducted from taxableBalance in the engine
  const baseRMDs = sum(projection.baseline_years, "rmdAmount");
  const baseTax = sum(projection.baseline_years, "federalTax") + sum(projection.baseline_years, "stateTax");
  const baseIrmaa = sum(projection.baseline_years, "irmaaSurcharge");
  const baseFinalTraditional = projection.baseline_final_traditional;
  const baseFinalRoth = projection.baseline_final_roth;
  // Heir tax only applies to traditional IRA portion (Roth and taxable are already taxed)
  const baseHeirTax = Math.round(baseFinalTraditional * heirTaxRate);
  // Net legacy = final net worth (includes taxable account) minus heir taxes on traditional
  const baseNetLegacy = projection.baseline_final_net_worth - baseHeirTax;

  // Get cumulative after-tax distributions for 'spent' scenario
  const lastBaselineYear = projection.baseline_years[projection.baseline_years.length - 1];
  const baseCumulativeDistributions = lastBaselineYear?.cumulativeDistributions ?? 0;

  // Lifetime wealth calculation depends on RMD treatment:
  // - 'spent': Net Legacy + Cumulative Distributions (RMDs were spent, not in legacy)
  // - 'reinvested'/'cash': Net Legacy only (RMDs are already in taxable balance)
  const baseLifetimeWealth = rmdTreatment === 'spent'
    ? baseNetLegacy + baseCumulativeDistributions
    : baseNetLegacy;
  const baseTotalTaxes = baseTax + baseIrmaa + baseHeirTax;

  // Strategy calculations
  const blueConversions = sum(projection.blueprint_years, "conversionAmount");
  const blueTax = sum(projection.blueprint_years, "federalTax") + sum(projection.blueprint_years, "stateTax");
  const blueIrmaa = sum(projection.blueprint_years, "irmaaSurcharge");
  const blueFinalTraditional = projection.blueprint_final_traditional;
  const blueFinalRoth = projection.blueprint_final_roth;
  // Heir tax only applies to remaining traditional IRA (if any)
  const blueHeirTax = Math.round(blueFinalTraditional * heirTaxRate);
  // Net legacy = final net worth minus heir taxes on traditional
  const blueNetLegacy = projection.blueprint_final_net_worth - blueHeirTax;
  // Lifetime wealth = net legacy (conversion taxes/IRMAA already deducted from taxable in engine)
  const blueLifetimeWealth = blueNetLegacy;
  const blueTotalTaxes = blueTax + blueIrmaa + blueHeirTax;

  // Differences
  const lifetimeWealthDiff = blueLifetimeWealth - baseLifetimeWealth;
  const lifetimeWealthPct = baseLifetimeWealth !== 0 ? lifetimeWealthDiff / Math.abs(baseLifetimeWealth) : 0;
  const taxSavings = baseTotalTaxes - blueTotalTaxes;
  const legacyDiff = blueNetLegacy - baseNetLegacy;

  // Conversion years data
  const conversionYears = projection.blueprint_years.filter(y => y.conversionAmount > 0);
  const avgTaxRate = blueConversions > 0 ? (blueTax / blueConversions) * 100 : 0;

  // Determine target tax bracket from conversions
  const getTargetBracket = () => {
    if (conversionYears.length === 0) return "N/A";
    // Use the constraint type to determine bracket
    const rate = client.tax_rate || client.max_tax_rate || 24;
    return `${rate}%`;
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-9 space-y-6">
        {/* Section 1: Strategy Summary (Hero) */}
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[16px] py-8 px-10">
          <p className="text-sm uppercase tracking-[3px] text-[rgba(255,255,255,0.4)] mb-6 font-medium">
            Your Roth Conversion Strategy
          </p>

          <div className="flex items-baseline gap-8 mb-6">
            <div>
              <p className={cn(
                "text-[44px] font-mono font-semibold",
                lifetimeWealthDiff >= 0 ? "text-gold" : "text-[#f87171]"
              )}>
                {lifetimeWealthDiff >= 0 ? "+" : ""}{toUSD(lifetimeWealthDiff)}
              </p>
              <p className="text-base text-[rgba(255,255,255,0.5)] mt-1">Additional Lifetime Wealth</p>
            </div>
            <div className="border-l border-[rgba(255,255,255,0.1)] pl-8">
              <p className={cn(
                "text-[28px] font-mono font-medium",
                lifetimeWealthDiff >= 0 ? "text-[#4ade80]" : "text-[#f87171]"
              )}>
                {baseLifetimeWealth > 0 ? `+${((lifetimeWealthDiff / baseLifetimeWealth) * 100).toFixed(1)}%` : "N/A"}
              </p>
              <p className="text-base text-[rgba(255,255,255,0.5)] mt-1">vs Doing Nothing</p>
            </div>
          </div>

          <div className="pt-5 border-t border-[rgba(255,255,255,0.07)]">
            <p className="text-base text-[rgba(255,255,255,0.5)]">
              Convert {toUSD(blueConversions)} over {conversionYears.length} years · Stay in the {getTargetBracket()} bracket
            </p>
            <p className="text-sm text-[rgba(255,255,255,0.4)] mt-1">
              Projected final Roth balance: {toUSD(blueFinalRoth)} (tax-free)
            </p>
          </div>
        </div>

        {/* Section 2: Key Metrics (4 Cards) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <ComparisonCard
            label="Lifetime Wealth"
            baseline={baseLifetimeWealth}
            strategy={blueLifetimeWealth}
            infoContent={
              <LifetimeWealthInfo
                client={client}
                projection={projection}
                baseFinalTraditional={baseFinalTraditional}
                baseFinalRoth={baseFinalRoth}
                baseHeirTax={baseHeirTax}
                baseNetLegacy={baseNetLegacy}
                baseCumulativeDistributions={baseCumulativeDistributions}
                baseLifetimeWealth={baseLifetimeWealth}
                baseTax={baseTax}
                baseRMDs={baseRMDs}
                blueFinalTraditional={blueFinalTraditional}
                blueFinalRoth={blueFinalRoth}
                blueHeirTax={blueHeirTax}
                blueNetLegacy={blueNetLegacy}
                blueLifetimeWealth={blueLifetimeWealth}
                blueTax={blueTax}
                blueConversions={blueConversions}
                rmdTreatment={rmdTreatment}
                heirTaxRate={heirTaxRate}
              />
            }
          />
          <ComparisonCard
            label="Legacy to Heirs"
            baseline={baseNetLegacy}
            strategy={blueNetLegacy}
            infoContent={
              <LegacyToHeirsInfo
                client={client}
                baseFinalTraditional={baseFinalTraditional}
                baseFinalRoth={baseFinalRoth}
                baseFinalTaxable={projection.baseline_final_taxable}
                baseHeirTax={baseHeirTax}
                baseNetLegacy={baseNetLegacy}
                blueFinalTraditional={blueFinalTraditional}
                blueFinalRoth={blueFinalRoth}
                blueFinalTaxable={projection.blueprint_final_taxable}
                blueHeirTax={blueHeirTax}
                blueNetLegacy={blueNetLegacy}
                heirTaxRate={heirTaxRate}
              />
            }
          />
          <ComparisonCard
            label="Total Taxes Paid"
            baseline={baseTotalTaxes}
            strategy={blueTotalTaxes}
            invertColor
            infoContent={
              <TotalTaxesInfo
                client={client}
                baseTax={baseTax}
                baseIrmaa={baseIrmaa}
                baseHeirTax={baseHeirTax}
                baseTotalTaxes={baseTotalTaxes}
                blueTax={blueTax}
                blueIrmaa={blueIrmaa}
                blueHeirTax={blueHeirTax}
                blueTotalTaxes={blueTotalTaxes}
                blueConversions={blueConversions}
                heirTaxRate={heirTaxRate}
              />
            }
          />
          <ComparisonCard
            label={rmdTreatment === 'spent' ? "After-Tax Distributions" : "Gross Distributions"}
            baseline={rmdTreatment === 'spent' ? baseCumulativeDistributions : baseRMDs}
            strategy={0}
            infoContent={
              <DistributionsInfo
                client={client}
                baseRMDs={baseRMDs}
                baseCumulativeDistributions={baseCumulativeDistributions}
                rmdTreatment={rmdTreatment}
              />
            }
          />
        </div>

        {/* Section 3: Conversion Strategy Breakdown */}
        {conversionYears.length > 0 && (
          <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-7">
            <p className="text-xs uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] mb-6 font-medium">
              Conversion Strategy
            </p>

            {/* Conversion Timeline */}
            <div className="flex gap-3 mb-6 overflow-x-auto pb-2">
              {conversionYears.slice(0, 8).map((year, idx) => (
                <div
                  key={year.year}
                  className="bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.2)] rounded-[10px] py-4 px-5 text-center min-w-[110px] shrink-0"
                >
                  <p className="text-sm font-mono text-[rgba(255,255,255,0.6)]">{year.year}</p>
                  <p className="text-xs text-[rgba(255,255,255,0.4)] mb-2">Age {year.age}</p>
                  <p className="text-lg font-mono font-medium text-gold">{toUSD(year.conversionAmount)}</p>
                  <p className="text-[10px] text-[rgba(255,255,255,0.4)] mt-1">Convert</p>
                  <p className="text-sm font-mono text-white mt-2">{client.tax_rate || 24}%</p>
                  <p className="text-[10px] text-[rgba(255,255,255,0.4)]">Bracket</p>
                </div>
              ))}
              {conversionYears.length > 8 && (
                <div className="flex items-center justify-center min-w-[80px] text-[rgba(255,255,255,0.4)] text-sm">
                  +{conversionYears.length - 8} more
                </div>
              )}
            </div>

            {/* Summary Row */}
            <div className="pt-5 border-t border-[rgba(255,255,255,0.07)]">
              <p className="text-sm text-[rgba(255,255,255,0.5)]">
                Total Converted: <span className="font-mono text-white">{toUSD(blueConversions)}</span>
                {" · "}
                Total Conversion Taxes: <span className="font-mono text-white">{toUSD(blueTax)}</span>
                {" · "}
                Avg Tax Rate: <span className="font-mono text-white">{avgTaxRate.toFixed(1)}%</span>
              </p>
            </div>
          </div>
        )}

        {/* Section 4: Legacy to Heirs Chart */}
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-7">
          <div className="flex justify-between items-center mb-6">
            <p className="text-xs uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] font-medium">
              Legacy to Heirs Over Time
            </p>
            <div className="flex items-center gap-5 text-sm">
              <span className="flex items-center gap-2 text-gold">
                <span className="w-4 h-0.5 bg-gold rounded" />
                Strategy (Roth)
              </span>
              <span className="flex items-center gap-2 text-[rgba(255,255,255,0.5)]">
                <span className="w-4 h-0.5 rounded" style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 4px, transparent 4px, transparent 6px)" }} />
                Baseline (Traditional)
              </span>
            </div>
          </div>
          <div className="h-[260px]">
            <WealthChart data={chartData} breakEvenAge={chartBreakEvenAge} />
          </div>
          {chartBreakEvenAge && (
            <p className="text-sm text-[rgba(255,255,255,0.4)] text-center mt-4">
              Strategy surpasses baseline at age {chartBreakEvenAge}
            </p>
          )}
        </div>

        {/* Section 5: Account & Liquidity Snapshot */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Account Summary */}
          <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-6">
            <p className="text-xs uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] mb-5 font-medium">
              Account Summary
            </p>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[rgba(255,255,255,0.5)]">Starting Balance</span>
                <span className="text-base font-mono text-white">{toUSD(client.qualified_account_value)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[rgba(255,255,255,0.5)]">Final Traditional IRA</span>
                <span className="text-base font-mono text-[rgba(255,255,255,0.6)]">{toUSD(blueFinalTraditional)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[rgba(255,255,255,0.5)]">Final Roth IRA</span>
                <span className="text-base font-mono text-[#4ade80]">{toUSD(blueFinalRoth)}</span>
              </div>
              <div className="pt-3 border-t border-[rgba(255,255,255,0.07)] flex justify-between items-center">
                <span className="text-sm text-[rgba(255,255,255,0.6)] font-medium">Total Portfolio</span>
                <span className="text-lg font-mono font-medium text-white">{toUSD(blueFinalTraditional + blueFinalRoth)}</span>
              </div>
            </div>
          </div>

          {/* Product Details */}
          <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-6">
            <p className="text-xs uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] mb-5 font-medium">
              Product Details
            </p>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[rgba(255,255,255,0.5)]">Carrier</span>
                <span className="text-sm font-mono text-[rgba(255,255,255,0.7)]">{client.carrier_name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[rgba(255,255,255,0.5)]">Product</span>
                <span className="text-sm font-mono text-[rgba(255,255,255,0.7)]">{client.product_name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[rgba(255,255,255,0.5)]">Assumed Return</span>
                <span className="text-sm font-mono text-gold">{client.rate_of_return}%</span>
              </div>
              {client.bonus_percent > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[rgba(255,255,255,0.5)]">Premium Bonus</span>
                  <span className="text-sm font-mono text-gold">{client.bonus_percent}%</span>
                </div>
              )}
              {client.anniversary_bonus_percent != null && client.anniversary_bonus_years != null && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[rgba(255,255,255,0.5)]">Anniversary Bonus</span>
                  <span className="text-sm font-mono text-gold">{client.anniversary_bonus_percent}% × {client.anniversary_bonus_years} years</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-[rgba(255,255,255,0.5)]">Surrender Period</span>
                <span className="text-sm font-mono text-[rgba(255,255,255,0.7)]">{client.surrender_years} years</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[rgba(255,255,255,0.5)]">Free Withdrawal</span>
                <span className="text-sm font-mono text-[rgba(255,255,255,0.7)]">{client.penalty_free_percent}% annually</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 6: Year-by-Year Table */}
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] overflow-hidden">
          {/* Table Header */}
          <div className="flex justify-between items-center px-6 py-5 border-b border-[rgba(255,255,255,0.07)]">
            <p className="text-xs uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] font-medium">
              Year-by-Year Projection
            </p>
            <div className="flex bg-[rgba(255,255,255,0.04)] rounded-lg p-1">
              <button
                onClick={() => setTableView("strategy")}
                className={cn(
                  "px-4 py-1.5 text-sm rounded-md transition-colors",
                  tableView === "strategy"
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
              <button
                onClick={() => setTableView("comparison")}
                className={cn(
                  "px-4 py-1.5 text-sm rounded-md transition-colors",
                  tableView === "comparison"
                    ? "bg-gold text-[#0c0c0c] font-medium"
                    : "text-[rgba(255,255,255,0.5)] hover:text-white"
                )}
              >
                Comparison
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {tableView === "strategy" && (
              <StrategyTable years={projection.blueprint_years} client={client} />
            )}
            {tableView === "baseline" && (
              <BaselineTable years={projection.baseline_years} client={client} />
            )}
            {tableView === "comparison" && (
              <ComparisonTable
                strategyYears={projection.blueprint_years}
                baselineYears={projection.baseline_years}
                heirTaxRate={heirTaxRate}
              />
            )}
          </div>
        </div>

        {/* Section 7: Disclaimer */}
        <p className="text-sm text-[rgba(255,255,255,0.4)] italic text-center max-w-[900px] mx-auto py-6">
          Projections use an assumed average annual return of {client.rate_of_return}% and do not represent guaranteed performance.
          Actual index-linked interest will vary based on market conditions and is subject to caps, participation rates, or spreads
          as declared by the carrier. The 0% floor protects against market losses but does not guarantee positive returns.
          Surrender charges apply during the surrender period. This illustration is for educational purposes only and should not
          be considered tax or investment advice. Consult a qualified professional before making financial decisions.
        </p>
      </div>
    </div>
  );
}

// Info Modal Component
function InfoModal({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="relative bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[16px] max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.07)]">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-colors"
          >
            <X className="h-5 w-5 text-[rgba(255,255,255,0.5)]" />
          </button>
        </div>
        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto max-h-[60vh] text-sm text-[rgba(255,255,255,0.7)] space-y-4">
          {children}
        </div>
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
  infoContent,
}: {
  label: string;
  baseline: number;
  strategy: number;
  invertColor?: boolean;
  infoContent?: ReactNode;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const diff = strategy - baseline;
  const pct = baseline !== 0 ? diff / Math.abs(baseline) : 0;
  const isPositive = invertColor ? diff <= 0 : diff >= 0;

  return (
    <>
      <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[12px] p-5">
        <div className="flex items-center gap-1.5 mb-4">
          <p className="text-xs uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] font-medium">
            {label}
          </p>
          {infoContent && (
            <button
              onClick={() => setShowInfo(true)}
              className="p-0.5 rounded hover:bg-[rgba(255,255,255,0.1)] transition-colors"
              title="Learn how this is calculated"
            >
              <Info className="h-3.5 w-3.5 text-[rgba(255,255,255,0.4)] hover:text-gold" />
            </button>
          )}
        </div>
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
      {infoContent && (
        <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} title={label}>
          {infoContent}
        </InfoModal>
      )}
    </>
  );
}

// Info Content Components
function LifetimeWealthInfo({
  client,
  projection,
  baseFinalTraditional,
  baseFinalRoth,
  baseHeirTax,
  baseNetLegacy,
  baseCumulativeDistributions,
  baseLifetimeWealth,
  baseTax,
  baseRMDs,
  blueFinalTraditional,
  blueFinalRoth,
  blueHeirTax,
  blueNetLegacy,
  blueLifetimeWealth,
  blueTax,
  blueConversions,
  rmdTreatment,
  heirTaxRate,
}: {
  client: Client;
  projection: Projection;
  baseFinalTraditional: number;
  baseFinalRoth: number;
  baseHeirTax: number;
  baseNetLegacy: number;
  baseCumulativeDistributions: number;
  baseLifetimeWealth: number;
  baseTax: number;
  baseRMDs: number;
  blueFinalTraditional: number;
  blueFinalRoth: number;
  blueHeirTax: number;
  blueNetLegacy: number;
  blueLifetimeWealth: number;
  blueTax: number;
  blueConversions: number;
  rmdTreatment: string;
  heirTaxRate: number;
}) {
  const heirTaxPct = Math.round(heirTaxRate * 100);
  const startingBalance = client.qualified_account_value ?? 0;
  const bonusAmount = Math.round(startingBalance * (client.bonus_percent ?? 0) / 100);
  const startingWithBonus = startingBalance + bonusAmount;
  const hasAnniversaryBonus = client.anniversary_bonus_percent != null && client.anniversary_bonus_years != null;
  const projectionYears = (client.end_age ?? 100) - (client.age ?? 62);
  const wealthDiff = blueLifetimeWealth - baseLifetimeWealth;

  return (
    <>
      <p className="text-white font-medium">What is Lifetime Wealth?</p>
      <p>
        Lifetime Wealth is the total value your family receives—what you pass to heirs (after their taxes)
        plus any retirement distributions you received. Here's exactly how we calculated yours:
      </p>

      {/* Starting Point */}
      <div className="bg-[rgba(255,255,255,0.05)] rounded-lg p-4">
        <p className="text-white font-medium text-xs uppercase tracking-wider mb-2">Your Starting Point</p>
        <div className="space-y-1 font-mono text-sm">
          <p>Initial Investment: {toUSD(startingBalance)}</p>
          <p>Age: {client.age} → projecting to age {client.end_age} ({projectionYears} years)</p>
          <p>Assumed Growth Rate: {client.rate_of_return}% annually</p>
        </div>
      </div>

      {/* Baseline Calculation */}
      <div className="bg-[rgba(255,255,255,0.03)] rounded-lg p-4 space-y-3">
        <p className="text-white font-medium text-xs uppercase tracking-wider">Baseline: Keep Traditional IRA</p>
        <p className="text-xs text-[rgba(255,255,255,0.5)]">
          Your {toUSD(startingBalance)} stays in a Traditional IRA, growing at {client.rate_of_return}% with RMDs starting at 73:
        </p>
        <div className="space-y-1 font-mono text-sm border-t border-[rgba(255,255,255,0.1)] pt-3">
          <p>Final Traditional IRA: {toUSD(baseFinalTraditional)}</p>
          <p>Final Roth IRA: {toUSD(baseFinalRoth)}</p>
          <p>Final Taxable Account: {toUSD(Math.max(0, projection.baseline_final_taxable))}</p>
          <p className="text-[rgba(255,255,255,0.5)]">─────────────────────</p>
          <p>Gross Estate: {toUSD(projection.baseline_final_net_worth)}</p>
          <p className="text-[#f87171]">− Heir Tax on Traditional ({heirTaxPct}%): {toUSD(baseHeirTax)}</p>
          <p className="text-white font-medium">= Net Legacy to Heirs: {toUSD(baseNetLegacy)}</p>
          {rmdTreatment === 'spent' && (
            <>
              <p className="text-[rgba(255,255,255,0.5)] mt-2">Plus distributions you received:</p>
              <p>+ After-Tax RMDs Spent: {toUSD(baseCumulativeDistributions)}</p>
            </>
          )}
          <p className="text-[rgba(255,255,255,0.5)]">─────────────────────</p>
          <p className="text-white font-semibold text-base">Baseline Lifetime Wealth: {toUSD(baseLifetimeWealth)}</p>
        </div>
        <p className="text-xs text-[rgba(255,255,255,0.4)] mt-2">
          Over {projectionYears} years, you'd take {toUSD(baseRMDs)} in RMDs and pay {toUSD(baseTax)} in income taxes on them.
        </p>
      </div>

      {/* Strategy Calculation */}
      <div className="bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.2)] rounded-lg p-4 space-y-3">
        <p className="text-gold font-medium text-xs uppercase tracking-wider">Strategy: Roth Conversions</p>
        <p className="text-xs text-[rgba(255,255,255,0.5)]">
          Your {toUSD(startingBalance)} + {client.bonus_percent}% premium bonus ({toUSD(bonusAmount)}) = {toUSD(startingWithBonus)} starting balance
          {hasAnniversaryBonus && <>, plus {client.anniversary_bonus_percent}% anniversary bonus applied at end of years 1-{client.anniversary_bonus_years}</>}
          , converted to Roth over time:
        </p>
        <div className="space-y-1 font-mono text-sm border-t border-[rgba(212,175,55,0.2)] pt-3">
          <p>Total Converted to Roth: {toUSD(blueConversions)}</p>
          <p>Conversion Taxes Paid: {toUSD(blueTax)}</p>
          <p className="text-[rgba(255,255,255,0.5)]">─────────────────────</p>
          <p>Final Traditional IRA: {toUSD(blueFinalTraditional)}</p>
          <p className="text-[#4ade80]">Final Roth IRA: {toUSD(blueFinalRoth)}</p>
          <p>Final Taxable Account: {toUSD(Math.max(0, projection.blueprint_final_taxable))}</p>
          <p className="text-[rgba(255,255,255,0.5)]">─────────────────────</p>
          <p>Gross Estate: {toUSD(projection.blueprint_final_net_worth)}</p>
          <p className="text-[#f87171]">− Heir Tax on Traditional ({heirTaxPct}%): {toUSD(blueHeirTax)}</p>
          <p className="text-gold font-semibold text-base">Strategy Lifetime Wealth: {toUSD(blueLifetimeWealth)}</p>
        </div>
        <p className="text-xs text-[rgba(255,255,255,0.4)] mt-2">
          No RMDs required from Roth. Your heirs inherit {toUSD(blueFinalRoth)} completely tax-free.
        </p>
      </div>

      {/* The Difference */}
      <div className={cn(
        "rounded-lg p-4",
        wealthDiff > 0
          ? "bg-[rgba(74,222,128,0.08)] border border-[rgba(74,222,128,0.2)]"
          : "bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.2)]"
      )}>
        <p className={cn("font-medium", wealthDiff > 0 ? "text-[#4ade80]" : "text-[#f87171]")}>
          The Bottom Line: {wealthDiff > 0 ? "+" : ""}{toUSD(wealthDiff)}
        </p>
        <p className="mt-2 text-sm">
          {wealthDiff > 0 ? (
            <>
              The Roth conversion strategy creates <strong>{toUSD(wealthDiff)} more</strong> in total family wealth.
              This comes from:
            </>
          ) : (
            <>The baseline scenario results in {toUSD(Math.abs(wealthDiff))} more lifetime wealth in this case.</>
          )}
        </p>
        {wealthDiff > 0 && (
          <ul className="list-disc pl-5 space-y-1 mt-2 text-sm">
            <li><strong>{client.bonus_percent}% premium bonus</strong> adding {toUSD(bonusAmount)} upfront{hasAnniversaryBonus && <> + <strong>{client.anniversary_bonus_percent}% anniversary bonus</strong> for {client.anniversary_bonus_years} years</>}</li>
            <li><strong>Tax-free Roth growth</strong> at {client.rate_of_return}% for {projectionYears} years</li>
            <li><strong>No heir taxes</strong> on {toUSD(blueFinalRoth)} Roth balance (vs {heirTaxPct}% on Traditional)</li>
            <li><strong>No forced RMDs</strong> keeping money invested longer</li>
          </ul>
        )}
      </div>
    </>
  );
}

function LegacyToHeirsInfo({
  client,
  baseFinalTraditional,
  baseFinalRoth,
  baseFinalTaxable,
  baseHeirTax,
  baseNetLegacy,
  blueFinalTraditional,
  blueFinalRoth,
  blueFinalTaxable,
  blueHeirTax,
  blueNetLegacy,
  heirTaxRate,
}: {
  client: Client;
  baseFinalTraditional: number;
  baseFinalRoth: number;
  baseFinalTaxable: number;
  baseHeirTax: number;
  baseNetLegacy: number;
  blueFinalTraditional: number;
  blueFinalRoth: number;
  blueFinalTaxable: number;
  blueHeirTax: number;
  blueNetLegacy: number;
  heirTaxRate: number;
}) {
  const heirTaxPct = Math.round(heirTaxRate * 100);

  return (
    <>
      <p className="text-white font-medium">What is Legacy to Heirs?</p>
      <p>
        This is the net amount your beneficiaries actually receive after paying any taxes owed on inherited accounts.
        Roth IRAs pass tax-free, but Traditional IRAs are taxed as income to your heirs.
      </p>

      <div className="bg-[rgba(255,255,255,0.03)] rounded-lg p-4 space-y-3">
        <p className="text-white font-medium text-xs uppercase tracking-wider">Baseline Inheritance</p>
        <p className="text-xs text-[rgba(255,255,255,0.5)]">Your heirs receive:</p>
        <div className="space-y-1 font-mono text-sm">
          <p>Traditional IRA Balance: {toUSD(baseFinalTraditional)}</p>
          <p className="text-[#f87171]">− Heir's Income Tax ({heirTaxPct}%): {toUSD(baseHeirTax)}</p>
          <p>+ Roth IRA (tax-free): {toUSD(baseFinalRoth)}</p>
          <p>+ Taxable Account: {toUSD(Math.max(0, baseFinalTaxable))}</p>
          <p className="border-t border-[rgba(255,255,255,0.1)] pt-2 text-white font-medium">
            = Net Legacy: {toUSD(baseNetLegacy)}
          </p>
        </div>
      </div>

      <div className="bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.2)] rounded-lg p-4 space-y-3">
        <p className="text-gold font-medium text-xs uppercase tracking-wider">Strategy Inheritance</p>
        <p className="text-xs text-[rgba(255,255,255,0.5)]">Your heirs receive:</p>
        <div className="space-y-1 font-mono text-sm">
          <p>Traditional IRA Balance: {toUSD(blueFinalTraditional)}</p>
          <p className="text-[#f87171]">− Heir's Income Tax ({heirTaxPct}%): {toUSD(blueHeirTax)}</p>
          <p className="text-[#4ade80]">+ Roth IRA (tax-free): {toUSD(blueFinalRoth)}</p>
          <p>+ Taxable Account: {toUSD(Math.max(0, blueFinalTaxable))}</p>
          <p className="border-t border-[rgba(212,175,55,0.2)] pt-2 text-gold font-medium">
            = Net Legacy: {toUSD(blueNetLegacy)}
          </p>
        </div>
      </div>

      <p className="text-[rgba(255,255,255,0.5)] text-xs">
        Note: We assume your heirs will be in the {heirTaxPct}% tax bracket when they inherit.
        Under current law, non-spouse beneficiaries must withdraw inherited IRAs within 10 years.
      </p>
    </>
  );
}

function TotalTaxesInfo({
  client,
  baseTax,
  baseIrmaa,
  baseHeirTax,
  baseTotalTaxes,
  blueTax,
  blueIrmaa,
  blueHeirTax,
  blueTotalTaxes,
  blueConversions,
  heirTaxRate,
}: {
  client: Client;
  baseTax: number;
  baseIrmaa: number;
  baseHeirTax: number;
  baseTotalTaxes: number;
  blueTax: number;
  blueIrmaa: number;
  blueHeirTax: number;
  blueTotalTaxes: number;
  blueConversions: number;
  heirTaxRate: number;
}) {
  const heirTaxPct = Math.round(heirTaxRate * 100);
  const taxSavings = baseTotalTaxes - blueTotalTaxes;

  return (
    <>
      <p className="text-white font-medium">What are Total Taxes Paid?</p>
      <p>
        This includes all taxes paid by you AND your heirs over the projection period—income taxes on
        distributions/conversions, Medicare IRMAA surcharges, and the taxes your heirs pay on inherited IRAs.
      </p>

      <div className="bg-[rgba(255,255,255,0.03)] rounded-lg p-4 space-y-3">
        <p className="text-white font-medium text-xs uppercase tracking-wider">Baseline Taxes</p>
        <div className="space-y-1 font-mono text-sm">
          <p>Income Tax on RMDs: {toUSD(baseTax)}</p>
          <p>Medicare IRMAA Surcharges: {toUSD(baseIrmaa)}</p>
          <p>Heir's Tax on Inheritance ({heirTaxPct}%): {toUSD(baseHeirTax)}</p>
          <p className="border-t border-[rgba(255,255,255,0.1)] pt-2 text-[#f87171] font-medium">
            = Total Taxes: {toUSD(baseTotalTaxes)}
          </p>
        </div>
      </div>

      <div className="bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.2)] rounded-lg p-4 space-y-3">
        <p className="text-gold font-medium text-xs uppercase tracking-wider">Strategy Taxes</p>
        <div className="space-y-1 font-mono text-sm">
          <p>Income Tax on Conversions: {toUSD(blueTax)}</p>
          <p className="text-xs text-[rgba(255,255,255,0.5)]">
            (Converted {toUSD(blueConversions)} staying in {client.max_tax_rate}% bracket)
          </p>
          <p>Medicare IRMAA Surcharges: {toUSD(blueIrmaa)}</p>
          <p>Heir's Tax on Remaining Traditional ({heirTaxPct}%): {toUSD(blueHeirTax)}</p>
          <p className="border-t border-[rgba(212,175,55,0.2)] pt-2 text-gold font-medium">
            = Total Taxes: {toUSD(blueTotalTaxes)}
          </p>
        </div>
      </div>

      <div className={cn(
        "rounded-lg p-4",
        taxSavings > 0
          ? "bg-[rgba(74,222,128,0.08)] border border-[rgba(74,222,128,0.2)]"
          : "bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.2)]"
      )}>
        <p className={taxSavings > 0 ? "text-[#4ade80] font-medium" : "text-[#f87171] font-medium"}>
          {taxSavings > 0 ? "Tax Savings" : "Additional Taxes"}
        </p>
        <p className="mt-2">
          {taxSavings > 0 ? (
            <>The strategy saves {toUSD(taxSavings)} in total taxes because you're converting at a {client.max_tax_rate}%
            rate now instead of your heirs paying {heirTaxPct}% later. Lower taxes = more wealth for your family.</>
          ) : (
            <>The strategy results in {toUSD(Math.abs(taxSavings))} more in taxes, but this is offset by
            greater tax-free growth in the Roth account.</>
          )}
        </p>
      </div>
    </>
  );
}

function DistributionsInfo({
  client,
  baseRMDs,
  baseCumulativeDistributions,
  rmdTreatment,
}: {
  client: Client;
  baseRMDs: number;
  baseCumulativeDistributions: number;
  rmdTreatment: string;
}) {
  return (
    <>
      <p className="text-white font-medium">
        {rmdTreatment === 'spent' ? "What are After-Tax Distributions?" : "What are Gross Distributions?"}
      </p>

      {rmdTreatment === 'spent' ? (
        <>
          <p>
            After-Tax Distributions represent the actual money you received and spent during retirement
            from Required Minimum Distributions, after paying income taxes on them.
          </p>
          <div className="bg-[rgba(255,255,255,0.03)] rounded-lg p-4 space-y-2">
            <p className="font-mono text-sm">Gross RMDs Taken: {toUSD(baseRMDs)}</p>
            <p className="font-mono text-sm">After Taxes: {toUSD(baseCumulativeDistributions)}</p>
          </div>
          <p className="text-[rgba(255,255,255,0.5)] text-xs">
            Since you selected "Spent on Living Expenses" for RMD treatment, these distributions
            are added to your Lifetime Wealth calculation (money you received and used).
          </p>
        </>
      ) : (
        <>
          <p>
            Gross Distributions represent the total Required Minimum Distributions (RMDs) you're
            forced to take from your Traditional IRA starting at age 73, before taxes.
          </p>
          <div className="bg-[rgba(255,255,255,0.03)] rounded-lg p-4 space-y-2">
            <p className="font-mono text-sm">Total Gross RMDs: {toUSD(baseRMDs)}</p>
            <p className="text-xs text-[rgba(255,255,255,0.5)]">
              (These are taxed as ordinary income each year)
            </p>
          </div>
        </>
      )}

      <div className="bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.2)] rounded-lg p-4">
        <p className="text-gold font-medium">Strategy: No Forced Distributions</p>
        <p className="mt-2">
          With the Roth conversion strategy, you convert to a Roth IRA which has <strong>no Required
          Minimum Distributions</strong>. This means:
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Your money stays invested and growing tax-free</li>
          <li>You choose when (or if) to take distributions</li>
          <li>No forced taxable income that could push you into higher brackets</li>
          <li>More control over your retirement income and tax situation</li>
        </ul>
      </div>
    </>
  );
}

// Strategy Table
function StrategyTable({ years, client }: { years: YearlyResult[]; client: Client }) {
  // Calculate totals
  const totalConverted = years.reduce((sum, row) => sum + row.conversionAmount, 0);
  const totalTaxes = years.reduce((sum, row) => sum + row.federalTax + row.stateTax, 0);

  // Calculate BOY (Beginning of Year) values
  // Year 1: Starting balance + bonus
  // Year N: Previous year's EOY balance
  const bonusPercent = client.bonus_percent ?? 0;
  const startingBalance = client.qualified_account_value ?? 0;
  const year1TradBOY = Math.round(startingBalance * (1 + bonusPercent / 100));
  const year1RothBOY = client.roth_ira ?? 0;

  const getBOY = (idx: number) => {
    if (idx === 0) {
      return { tradBOY: year1TradBOY, rothBOY: year1RothBOY };
    }
    const prevYear = years[idx - 1];
    return {
      tradBOY: prevYear.traditionalBalance,
      rothBOY: prevYear.rothBalance
    };
  };

  return (
    <table className="w-full">
      <thead>
        <tr className="bg-[rgba(255,255,255,0.02)]">
          <th className="text-left px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Year</th>
          <th className="text-left px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Age</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Trad BOY</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Converted</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Taxes</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Trad EOY</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Roth EOY</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Net Worth</th>
        </tr>
      </thead>
      <tbody>
        {years.map((row, idx) => {
          const hasConversion = row.conversionAmount > 0;
          const { tradBOY, rothBOY } = getBOY(idx);
          return (
            <tr
              key={row.year}
              className={cn(
                "border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] transition-colors",
                hasConversion && "border-l-[3px] border-l-gold"
              )}
            >
              <td className="px-4 py-3 text-sm font-mono text-[rgba(255,255,255,0.6)]">{row.year}</td>
              <td className="px-4 py-3 text-sm text-[rgba(255,255,255,0.5)]">{row.age}</td>
              <td className="px-4 py-3 text-sm font-mono text-right text-[rgba(255,255,255,0.5)]">
                {toUSD(tradBOY)}
              </td>
              <td className={cn(
                "px-4 py-3 text-sm font-mono text-right",
                hasConversion ? "text-gold" : "text-[rgba(255,255,255,0.25)]"
              )}>
                {hasConversion ? toUSD(row.conversionAmount) : "—"}
              </td>
              <td className="px-4 py-3 text-sm font-mono text-right text-[#f87171]">
                {toUSD(row.federalTax + row.stateTax)}
              </td>
              <td className="px-4 py-3 text-sm font-mono text-right text-[rgba(255,255,255,0.5)]">
                {toUSD(row.traditionalBalance)}
              </td>
              <td className={cn(
                "px-4 py-3 text-sm font-mono text-right",
                row.rothBalance > 0 ? "text-[#4ade80]" : "text-[rgba(255,255,255,0.25)]"
              )}>
                {row.rothBalance > 0 ? toUSD(row.rothBalance) : "—"}
              </td>
              <td className="px-4 py-3 text-sm font-mono text-right text-white">
                {toUSD(row.netWorth)}
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="bg-[rgba(255,255,255,0.04)] border-t border-[rgba(255,255,255,0.1)]">
          <td className="px-4 py-3 text-sm font-semibold text-white" colSpan={3}>TOTALS</td>
          <td className="px-4 py-3 text-sm font-mono text-right font-semibold text-gold">
            {toUSD(totalConverted)}
          </td>
          <td className="px-4 py-3 text-sm font-mono text-right font-semibold text-[#f87171]">
            {toUSD(totalTaxes)}
          </td>
          <td className="px-4 py-3 text-sm font-mono text-right text-[rgba(255,255,255,0.5)]" colSpan={3}>—</td>
        </tr>
      </tfoot>
    </table>
  );
}

// Baseline Table
function BaselineTable({ years, client }: { years: YearlyResult[]; client: Client }) {
  // Calculate totals
  const totalRMDs = years.reduce((sum, row) => sum + row.rmdAmount, 0);
  const totalTaxes = years.reduce((sum, row) => sum + row.federalTax + row.stateTax, 0);

  // Calculate BOY (Beginning of Year) values
  // Baseline does NOT get the product bonus
  const startingBalance = client.qualified_account_value ?? 0;

  const getBOY = (idx: number) => {
    if (idx === 0) {
      return startingBalance;
    }
    return years[idx - 1].traditionalBalance;
  };

  return (
    <table className="w-full">
      <thead>
        <tr className="bg-[rgba(255,255,255,0.02)]">
          <th className="text-left px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Year</th>
          <th className="text-left px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Age</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Trad BOY</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">RMD</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Taxes</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Trad EOY</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Net Worth</th>
        </tr>
      </thead>
      <tbody>
        {years.map((row, idx) => {
          const tradBOY = getBOY(idx);
          return (
            <tr
              key={row.year}
              className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] transition-colors"
            >
              <td className="px-4 py-3 text-sm font-mono text-[rgba(255,255,255,0.6)]">{row.year}</td>
              <td className="px-4 py-3 text-sm text-[rgba(255,255,255,0.5)]">{row.age}</td>
              <td className="px-4 py-3 text-sm font-mono text-right text-[rgba(255,255,255,0.5)]">
                {toUSD(tradBOY)}
              </td>
              <td className={cn(
                "px-4 py-3 text-sm font-mono text-right",
                row.rmdAmount > 0 ? "text-[rgba(255,255,255,0.6)]" : "text-[rgba(255,255,255,0.25)]"
              )}>
                {row.rmdAmount > 0 ? toUSD(row.rmdAmount) : "—"}
              </td>
              <td className="px-4 py-3 text-sm font-mono text-right text-[#f87171]">
                {toUSD(row.federalTax + row.stateTax)}
              </td>
              <td className="px-4 py-3 text-sm font-mono text-right text-[rgba(255,255,255,0.5)]">
                {toUSD(row.traditionalBalance)}
              </td>
              <td className="px-4 py-3 text-sm font-mono text-right text-white">
                {toUSD(row.netWorth)}
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="bg-[rgba(255,255,255,0.04)] border-t border-[rgba(255,255,255,0.1)]">
          <td className="px-4 py-3 text-sm font-semibold text-white" colSpan={3}>TOTALS</td>
          <td className="px-4 py-3 text-sm font-mono text-right font-semibold text-white">
            {toUSD(totalRMDs)}
          </td>
          <td className="px-4 py-3 text-sm font-mono text-right font-semibold text-[#f87171]">
            {toUSD(totalTaxes)}
          </td>
          <td className="px-4 py-3 text-sm font-mono text-right text-[rgba(255,255,255,0.5)]" colSpan={2}>—</td>
        </tr>
      </tfoot>
    </table>
  );
}

// Comparison Table
function ComparisonTable({
  strategyYears,
  baselineYears,
  heirTaxRate
}: {
  strategyYears: YearlyResult[];
  baselineYears: YearlyResult[];
  heirTaxRate: number;
}) {
  return (
    <table className="w-full">
      <thead>
        <tr className="bg-[rgba(255,255,255,0.02)]">
          <th className="text-left px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Year</th>
          <th className="text-left px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Age</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Baseline</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Strategy</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Roth</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Total</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Difference</th>
        </tr>
      </thead>
      <tbody>
        {strategyYears.map((stratRow, idx) => {
          const baseRow = baselineYears[idx];
          if (!baseRow) return null;

          const strategyTotal = stratRow.traditionalBalance + stratRow.rothBalance;
          const diff = strategyTotal - baseRow.traditionalBalance;

          return (
            <tr
              key={stratRow.year}
              className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] transition-colors"
            >
              <td className="px-4 py-3 text-sm font-mono text-[rgba(255,255,255,0.6)]">{stratRow.year}</td>
              <td className="px-4 py-3 text-sm text-[rgba(255,255,255,0.5)]">{stratRow.age}</td>
              <td className="px-4 py-3 text-sm font-mono text-right text-[rgba(255,255,255,0.4)]">
                {toUSD(baseRow.traditionalBalance)}
              </td>
              <td className="px-4 py-3 text-sm font-mono text-right text-[rgba(255,255,255,0.5)]">
                {toUSD(stratRow.traditionalBalance)}
              </td>
              <td className={cn(
                "px-4 py-3 text-sm font-mono text-right",
                stratRow.rothBalance > 0 ? "text-[#4ade80]" : "text-[rgba(255,255,255,0.25)]"
              )}>
                {stratRow.rothBalance > 0 ? toUSD(stratRow.rothBalance) : "—"}
              </td>
              <td className="px-4 py-3 text-sm font-mono text-right text-white">
                {toUSD(strategyTotal)}
              </td>
              <td className={cn(
                "px-4 py-3 text-sm font-mono text-right font-medium",
                diff >= 0 ? "text-[#4ade80]" : "text-[#f87171]"
              )}>
                {diff >= 0 ? "+" : ""}{toUSD(diff)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
