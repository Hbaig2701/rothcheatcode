"use client";

import { useState, ReactNode, useEffect } from "react";
import type { Projection } from "@/lib/types/projection";
import type { Client } from "@/lib/types/client";
import type { YearlyResult } from "@/lib/calculations";
import { WealthChart } from "@/components/results/wealth-chart";
import { transformToChartData } from "@/lib/calculations/transforms";
import { ChevronDown, ChevronUp, Info, X, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALL_PRODUCTS, type FormulaType } from "@/lib/config/products";
import { ResizableTable } from "@/components/results/deep-dive/resizable-table";
import { ColumnSelectorModal } from "@/components/results/deep-dive/column-selector-modal";
import { COLUMN_DEFINITIONS } from "@/lib/table-columns/column-definitions";
import { loadColumnPreferences, saveColumnPreferences, getDefaultColumns } from "@/lib/table-columns/storage";
import { AdvancedFeaturesSection } from "@/components/results/advanced-features-section";

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
  const [columnModalOpen, setColumnModalOpen] = useState(false);

  // Column customization state with SSR safety
  const [selectedColumns, setSelectedColumns] = useState<string[]>(() => {
    if (typeof window === 'undefined') return getDefaultColumns("growth");
    const saved = loadColumnPreferences(`report-${tableView}`);
    return saved?.selectedColumns || getDefaultColumns("growth");
  });

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {};
    const saved = loadColumnPreferences(`report-${tableView}`);
    return saved?.columnWidths || {};
  });

  // Update selected columns when switching table views
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = loadColumnPreferences(`report-${tableView}`);
    if (saved?.selectedColumns) {
      setSelectedColumns(saved.selectedColumns);
      setColumnWidths(saved.columnWidths || {});
    } else {
      setSelectedColumns(getDefaultColumns("growth"));
      setColumnWidths({});
    }
  }, [tableView]);

  const handleSaveColumns = (columns: string[]) => {
    setSelectedColumns(columns);
    saveColumnPreferences(`report-${tableView}`, {
      selectedColumns: columns,
      columnWidths,
      lastUpdated: new Date().toISOString(),
    });
  };

  const handleWidthChange = (columnId: string, width: number) => {
    const newWidths = { ...columnWidths, [columnId]: width };
    setColumnWidths(newWidths);
    saveColumnPreferences(`report-${tableView}`, {
      selectedColumns,
      columnWidths: newWidths,
      lastUpdated: new Date().toISOString(),
    });
  };

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

  // Penalty-free withdrawal check — only if client has a surrender schedule
  const penaltyFreePercent = (client.penalty_free_percent ?? 10) / 100;
  const surrenderYears = client.surrender_years ?? 0;
  const surrenderSchedule = client.surrender_schedule ?? [];
  const hasSurrenderSchedule = surrenderSchedule.length > 0 && surrenderSchedule.some(v => v > 0);
  const penaltyFreeViolations = !hasSurrenderSchedule ? [] : projection.blueprint_years
    .map((year, idx) => {
      if (year.conversionAmount <= 0) return null;
      const yearOffset = idx;
      if (yearOffset >= surrenderYears) return null; // Past surrender period
      // BOY IRA balance: previous year's end balance, or initial deposit + bonus for year 0
      const boyIRA = idx > 0
        ? projection.blueprint_years[idx - 1].traditionalBalance
        : Math.round((client.qualified_account_value ?? 0) * (1 + (client.bonus_percent ?? 0) / 100));
      const penaltyFreeLimit = Math.round(boyIRA * penaltyFreePercent);
      if (year.conversionAmount > penaltyFreeLimit) {
        const excess = year.conversionAmount - penaltyFreeLimit;
        const chargePercent = yearOffset < surrenderSchedule.length ? surrenderSchedule[yearOffset] : 0;
        const estimatedCharge = Math.round(excess * chargePercent / 100);
        return {
          year: year.year,
          age: year.age,
          conversion: year.conversionAmount,
          limit: penaltyFreeLimit,
          excess,
          chargePercent,
          estimatedCharge,
        };
      }
      return null;
    })
    .filter(Boolean) as Array<{
      year: number; age: number; conversion: number;
      limit: number; excess: number; chargePercent: number; estimatedCharge: number;
    }>;

  // Determine target tax bracket from conversions
  const getTargetBracket = () => {
    if (conversionYears.length === 0) return "N/A";
    // Use the constraint type to determine bracket
    const rate = client.tax_rate || client.max_tax_rate || 24;
    return `${rate}%`;
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden">
      <div className="p-9 space-y-6">
        {/* Section 1: Strategy Summary (Hero) */}
        <div className="bg-bg-card border border-border-default rounded-[16px] py-8 px-10">
          <p className="text-sm uppercase tracking-[3px] text-text-dim mb-6 font-medium">
            Your Roth Conversion Strategy
          </p>

          <div className="flex items-baseline gap-8 mb-6">
            <div>
              <p className={cn(
                "text-[44px] font-mono font-semibold",
                lifetimeWealthDiff >= 0 ? "text-gold" : "text-red"
              )}>
                {lifetimeWealthDiff >= 0 ? "+" : ""}{toUSD(lifetimeWealthDiff)}
              </p>
              <p className="text-base text-text-muted mt-1">Additional Lifetime Wealth</p>
            </div>
            <div className="border-l border-border-default pl-8">
              <p className={cn(
                "text-[28px] font-mono font-medium",
                lifetimeWealthDiff >= 0 ? "text-green" : "text-red"
              )}>
                {baseLifetimeWealth !== 0 ? `${lifetimeWealthDiff >= 0 ? "+" : ""}${((lifetimeWealthDiff / Math.abs(baseLifetimeWealth)) * 100).toFixed(1)}%` : "N/A"}
              </p>
              <p className="text-base text-text-muted mt-1">vs Doing Nothing</p>
            </div>
          </div>

          <div className="pt-5 border-t border-border-default">
            <p className="text-base text-text-muted">
              Convert {toUSD(blueConversions)} over {conversionYears.length} years · Stay in the {getTargetBracket()} bracket
            </p>
            <p className="text-sm text-text-dim mt-1">
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
            invertColor={rmdTreatment !== 'spent'}
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
          <div className="bg-bg-card border border-border-default rounded-[14px] p-7">
            <p className="text-xs uppercase tracking-[1.5px] text-text-muted mb-6 font-medium">
              Conversion Strategy
            </p>

            {/* Conversion Timeline */}
            <div className="flex gap-3 mb-6 overflow-x-auto pb-2">
              {conversionYears.map((year) => (
                <div
                  key={year.year}
                  className="bg-accent border border-gold-border rounded-[10px] py-4 px-5 text-center min-w-[110px] shrink-0"
                >
                  <p className="text-sm font-mono text-text-dim">{year.year}</p>
                  <p className="text-xs text-text-dim mb-2">Age {year.age}</p>
                  <p className="text-lg font-mono font-medium text-gold">{toUSD(year.conversionAmount)}</p>
                  <p className="text-xs text-text-dim mt-1">Convert</p>
                  <p className="text-sm font-mono text-foreground mt-2">{client.tax_rate || 24}%</p>
                  <p className="text-xs text-text-dim">Bracket</p>
                </div>
              ))}
            </div>

            {/* Summary Row */}
            <div className="pt-5 border-t border-border-default">
              <p className="text-sm text-text-muted">
                Total Converted: <span className="font-mono text-foreground">{toUSD(blueConversions)}</span>
                {" · "}
                Total Conversion Taxes: <span className="font-mono text-foreground">{toUSD(blueTax)}</span>
                {" · "}
                Avg Tax Rate: <span className="font-mono text-foreground">{avgTaxRate.toFixed(1)}%</span>
              </p>
            </div>
          </div>
        )}

        {/* Penalty-Free Withdrawal Warning */}
        {penaltyFreeViolations.length > 0 && (
          <div className="bg-[rgba(250,204,21,0.06)] border border-[rgba(250,204,21,0.25)] rounded-[14px] p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="shrink-0 mt-0.5 w-8 h-8 rounded-full bg-[rgba(250,204,21,0.15)] flex items-center justify-center">
                <span className="text-base">⚠️</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Penalty-Free Withdrawal Limit Exceeded
                </p>
                <p className="text-xs text-text-muted mt-1">
                  The following conversions exceed the {client.penalty_free_percent ?? 10}% annual penalty-free withdrawal allowance during the surrender period.
                  Surrender charges may apply to the excess amount.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(250,204,21,0.2)]">
                    <th className="text-left py-2 px-3 text-xs font-medium text-text-muted">Year</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-text-muted">Age</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-text-muted">Conversion</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-text-muted">Penalty-Free Limit</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-text-muted">Excess</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-text-muted">Surrender %</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-text-muted">Est. Charge</th>
                  </tr>
                </thead>
                <tbody>
                  {penaltyFreeViolations.map((v) => (
                    <tr key={v.year} className="border-b border-border-default/30">
                      <td className="py-2 px-3 font-mono text-text-dim">{v.year}</td>
                      <td className="py-2 px-3 text-text-dim">{v.age}</td>
                      <td className="py-2 px-3 font-mono text-right text-foreground">{toUSD(v.conversion)}</td>
                      <td className="py-2 px-3 font-mono text-right text-green">{toUSD(v.limit)}</td>
                      <td className="py-2 px-3 font-mono text-right text-red">{toUSD(v.excess)}</td>
                      <td className="py-2 px-3 font-mono text-right text-text-muted">{v.chargePercent}%</td>
                      <td className="py-2 px-3 font-mono text-right text-red font-medium">{toUSD(v.estimatedCharge)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[rgba(250,204,21,0.3)]">
                    <td className="py-3 px-3 text-xs font-semibold text-text-muted uppercase tracking-wider" colSpan={2}>Total</td>
                    <td className="py-3 px-3 font-mono text-right text-foreground font-semibold">{toUSD(penaltyFreeViolations.reduce((s, v) => s + v.conversion, 0))}</td>
                    <td className="py-3 px-3 font-mono text-right text-green font-semibold">{toUSD(penaltyFreeViolations.reduce((s, v) => s + v.limit, 0))}</td>
                    <td className="py-3 px-3 font-mono text-right text-red font-semibold">{toUSD(penaltyFreeViolations.reduce((s, v) => s + v.excess, 0))}</td>
                    <td className="py-3 px-3"></td>
                    <td className="py-3 px-3 font-mono text-right text-red font-bold">{toUSD(penaltyFreeViolations.reduce((s, v) => s + v.estimatedCharge, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-text-dimmer mt-3 italic">
              Consider adjusting conversion amounts or using a fixed conversion within the penalty-free limit to avoid surrender charges.
            </p>
          </div>
        )}

        {/* Section 4: Legacy to Heirs Chart */}
        <div className="bg-bg-card border border-border-default rounded-[14px] p-7">
          <div className="flex justify-between items-center mb-6">
            <p className="text-xs uppercase tracking-[1.5px] text-text-muted font-medium">
              Legacy to Heirs Over Time
            </p>
            <div className="flex items-center gap-5 text-sm">
              <span className="flex items-center gap-2 text-gold">
                <span className="w-4 h-0.5 bg-gold rounded" />
                Strategy (Roth)
              </span>
              <span className="flex items-center gap-2 text-text-muted">
                <span className="w-4 h-0.5 rounded" style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 4px, transparent 4px, transparent 6px)" }} />
                Baseline (Traditional)
              </span>
            </div>
          </div>
          <div className="h-[260px]">
            <WealthChart data={chartData} breakEvenAge={chartBreakEvenAge} />
          </div>
          {chartBreakEvenAge && (
            <p className="text-sm text-text-dim text-center mt-4">
              Strategy surpasses baseline at age {chartBreakEvenAge}
            </p>
          )}
        </div>

        {/* Section 5: Account & Liquidity Snapshot */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Account Summary */}
          <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
            <p className="text-xs uppercase tracking-[1.5px] text-text-muted mb-5 font-medium">
              Account Summary
            </p>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-muted">Starting Balance</span>
                <span className="text-base font-mono text-foreground">{toUSD(client.qualified_account_value)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-muted">Final Traditional IRA</span>
                <span className="text-base font-mono text-text-dim">{toUSD(blueFinalTraditional)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-muted">Final Roth IRA</span>
                <span className="text-base font-mono text-green">{toUSD(blueFinalRoth)}</span>
              </div>
              <div className="pt-3 border-t border-border-default flex justify-between items-center">
                <span className="text-sm text-text-dim font-medium">Total Portfolio</span>
                <span className="text-lg font-mono font-medium text-foreground">{toUSD(blueFinalTraditional + blueFinalRoth)}</span>
              </div>
            </div>
          </div>

          {/* Product Details */}
          <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
            <p className="text-xs uppercase tracking-[1.5px] text-text-muted mb-5 font-medium">
              Product Details
            </p>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-muted">Carrier</span>
                <span className="text-sm font-mono text-text-muted">{client.carrier_name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-muted">Product</span>
                <span className="text-sm font-mono text-text-muted">{client.product_name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-muted">Assumed Return</span>
                <span className="text-sm font-mono text-gold">{client.rate_of_return}%</span>
              </div>
              {client.bonus_percent > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text-muted">Premium Bonus</span>
                  <span className="text-sm font-mono text-gold">{client.bonus_percent}%</span>
                </div>
              )}
              {client.anniversary_bonus_percent != null && client.anniversary_bonus_years != null && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text-muted">Anniversary Bonus</span>
                  <span className="text-sm font-mono text-gold">{client.anniversary_bonus_percent}% × {client.anniversary_bonus_years} years</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-muted">Surrender Period</span>
                <span className="text-sm font-mono text-text-muted">{client.surrender_years} years</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-muted">Free Withdrawal</span>
                <span className="text-sm font-mono text-text-muted">{client.penalty_free_percent}% annually</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 6: Year-by-Year Table */}
        <div className="bg-bg-card border border-border-default rounded-[14px] overflow-hidden">
          {/* Table Header */}
          <div className="flex justify-between items-center px-6 py-5 border-b border-border-default">
            <p className="text-xs uppercase tracking-[1.5px] text-text-muted font-medium">
              Year-by-Year Projection
            </p>
            <div className="flex items-center gap-3">
              {/* Adjust Columns button */}
              <button
                onClick={() => setColumnModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-bg-card-hover border border-border-default rounded-lg text-foreground hover:bg-[rgba(255,255,255,0.1)] transition-colors"
              >
                <Settings2 className="h-4 w-4" />
                Adjust Columns
              </button>
              {/* View tabs */}
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
                <button
                  onClick={() => setTableView("comparison")}
                  className={cn(
                    "px-4 py-1.5 text-sm rounded-md transition-colors",
                    tableView === "comparison"
                      ? "bg-gold text-primary-foreground font-medium"
                      : "text-text-muted hover:text-foreground"
                  )}
                >
                  Comparison
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="p-6 overflow-x-auto">
            {tableView === "strategy" && (
              <ResizableTable
                columns={COLUMN_DEFINITIONS.filter(col => selectedColumns.includes(col.id))}
                data={projection.blueprint_years}
                columnWidths={columnWidths}
                onColumnWidthChange={handleWidthChange}
                frozenColumnCount={2}
              />
            )}
            {tableView === "baseline" && (
              <ResizableTable
                columns={COLUMN_DEFINITIONS.filter(col => selectedColumns.includes(col.id))}
                data={projection.baseline_years}
                columnWidths={columnWidths}
                onColumnWidthChange={handleWidthChange}
                frozenColumnCount={2}
              />
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

        {/* Column Selector Modal */}
        <ColumnSelectorModal
          open={columnModalOpen}
          onClose={() => setColumnModalOpen(false)}
          selectedColumns={selectedColumns}
          onSave={handleSaveColumns}
          productType="growth"
        />

        {/* Section 7: Advanced Analysis (Widow's Penalty, Breakeven, Audit) */}
        <AdvancedFeaturesSection client={client} chartData={chartData} />

        {/* Section 8: Disclaimer */}
        <p className="text-sm text-text-dim italic text-center max-w-[900px] mx-auto py-6">
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
      <div className="relative bg-surface-elevated border border-border-default rounded-[16px] max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-default">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-bg-card-hover transition-colors"
          >
            <X className="h-5 w-5 text-text-muted" />
          </button>
        </div>
        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto max-h-[60vh] text-sm text-text-muted space-y-4">
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
      <div className="bg-bg-card border border-border-default rounded-[12px] p-5">
        <div className="flex items-center gap-1.5 mb-4">
          <p className="text-xs uppercase tracking-[1.5px] text-text-muted font-medium">
            {label}
          </p>
          {infoContent && (
            <button
              onClick={() => setShowInfo(true)}
              className="p-0.5 rounded hover:bg-[rgba(255,255,255,0.1)] transition-colors"
              title="Learn how this is calculated"
            >
              <Info className="h-3.5 w-3.5 text-text-dim hover:text-gold" />
            </button>
          )}
        </div>
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
      <p className="text-foreground font-medium">What is Lifetime Wealth?</p>
      <p>
        Lifetime Wealth is the total value your family receives—what you pass to heirs (after their taxes)
        plus any retirement distributions you received. Here's exactly how we calculated yours:
      </p>

      {/* Starting Point */}
      <div className="bg-bg-card-hover rounded-lg p-4">
        <p className="text-foreground font-medium text-xs uppercase tracking-wider mb-2">Your Starting Point</p>
        <div className="space-y-1 font-mono text-sm">
          <p>Initial Investment: {toUSD(startingBalance)}</p>
          <p>Age: {client.age} → projecting to age {client.end_age} ({projectionYears} years)</p>
          <p>Assumed Growth Rate: {client.rate_of_return}% annually</p>
        </div>
      </div>

      {/* Baseline Calculation */}
      <div className="bg-bg-card rounded-lg p-4 space-y-3">
        <p className="text-foreground font-medium text-xs uppercase tracking-wider">Baseline: Keep Traditional IRA</p>
        <p className="text-xs text-text-muted">
          Your {toUSD(startingBalance)} stays in a Traditional IRA, growing at {client.rate_of_return}% with RMDs starting at 73:
        </p>
        <div className="space-y-1 font-mono text-sm border-t border-border-default pt-3">
          <p>Final Traditional IRA: {toUSD(baseFinalTraditional)}</p>
          <p>Final Roth IRA: {toUSD(baseFinalRoth)}</p>
          <p>Final Taxable Account: {toUSD(Math.max(0, projection.baseline_final_taxable))}</p>
          <p className="text-text-muted">─────────────────────</p>
          <p>Gross Estate: {toUSD(projection.baseline_final_net_worth)}</p>
          <p className="text-red">− Heir Tax on Traditional ({heirTaxPct}%): {toUSD(baseHeirTax)}</p>
          <p className="text-foreground font-medium">= Net Legacy to Heirs: {toUSD(baseNetLegacy)}</p>
          {rmdTreatment === 'spent' && (
            <>
              <p className="text-text-muted mt-2">Plus distributions you received:</p>
              <p>+ After-Tax RMDs Spent: {toUSD(baseCumulativeDistributions)}</p>
            </>
          )}
          <p className="text-text-muted">─────────────────────</p>
          <p className="text-foreground font-semibold text-base">Baseline Lifetime Wealth: {toUSD(baseLifetimeWealth)}</p>
        </div>
        <p className="text-xs text-text-dim mt-2">
          Over {projectionYears} years, you'd take {toUSD(baseRMDs)} in RMDs and pay {toUSD(baseTax)} in income taxes on them.
        </p>
      </div>

      {/* Strategy Calculation */}
      <div className="bg-accent border border-gold-border rounded-lg p-4 space-y-3">
        <p className="text-gold font-medium text-xs uppercase tracking-wider">Strategy: Roth Conversions</p>
        <p className="text-xs text-text-muted">
          Your {toUSD(startingBalance)} + {client.bonus_percent}% premium bonus ({toUSD(bonusAmount)}) = {toUSD(startingWithBonus)} starting balance
          {hasAnniversaryBonus && <>, plus {client.anniversary_bonus_percent}% anniversary bonus applied at end of years 1-{client.anniversary_bonus_years}</>}
          , converted to Roth over time:
        </p>
        <div className="space-y-1 font-mono text-sm border-t border-gold-border pt-3">
          <p>Total Converted to Roth: {toUSD(blueConversions)}</p>
          <p>Conversion Taxes Paid: {toUSD(blueTax)}</p>
          <p className="text-text-muted">─────────────────────</p>
          <p>Final Traditional IRA: {toUSD(blueFinalTraditional)}</p>
          <p className="text-green">Final Roth IRA: {toUSD(blueFinalRoth)}</p>
          <p>Final Taxable Account: {toUSD(Math.max(0, projection.blueprint_final_taxable))}</p>
          <p className="text-text-muted">─────────────────────</p>
          <p>Gross Estate: {toUSD(projection.blueprint_final_net_worth)}</p>
          <p className="text-red">− Heir Tax on Traditional ({heirTaxPct}%): {toUSD(blueHeirTax)}</p>
          <p className="text-gold font-semibold text-base">Strategy Lifetime Wealth: {toUSD(blueLifetimeWealth)}</p>
        </div>
        <p className="text-xs text-text-dim mt-2">
          No RMDs required from Roth. Your heirs inherit {toUSD(blueFinalRoth)} completely tax-free.
        </p>
      </div>

      {/* The Difference */}
      <div className={cn(
        "rounded-lg p-4",
        wealthDiff > 0
          ? "bg-green-bg border border-green/20"
          : "bg-red-bg border border-red/20"
      )}>
        <p className={cn("font-medium", wealthDiff > 0 ? "text-green" : "text-red")}>
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
      <p className="text-foreground font-medium">What is Legacy to Heirs?</p>
      <p>
        This is the net amount your beneficiaries actually receive after paying any taxes owed on inherited accounts.
        Roth IRAs pass tax-free, but Traditional IRAs are taxed as income to your heirs.
      </p>

      <div className="bg-bg-card rounded-lg p-4 space-y-3">
        <p className="text-foreground font-medium text-xs uppercase tracking-wider">Baseline Inheritance</p>
        <p className="text-xs text-text-muted">Your heirs receive:</p>
        <div className="space-y-1 font-mono text-sm">
          <p>Traditional IRA Balance: {toUSD(baseFinalTraditional)}</p>
          <p className="text-red">− Heir's Income Tax ({heirTaxPct}%): {toUSD(baseHeirTax)}</p>
          <p>+ Roth IRA (tax-free): {toUSD(baseFinalRoth)}</p>
          <p>+ Taxable Account: {toUSD(Math.max(0, baseFinalTaxable))}</p>
          <p className="border-t border-border-default pt-2 text-foreground font-medium">
            = Net Legacy: {toUSD(baseNetLegacy)}
          </p>
        </div>
      </div>

      <div className="bg-accent border border-gold-border rounded-lg p-4 space-y-3">
        <p className="text-gold font-medium text-xs uppercase tracking-wider">Strategy Inheritance</p>
        <p className="text-xs text-text-muted">Your heirs receive:</p>
        <div className="space-y-1 font-mono text-sm">
          <p>Traditional IRA Balance: {toUSD(blueFinalTraditional)}</p>
          <p className="text-red">− Heir's Income Tax ({heirTaxPct}%): {toUSD(blueHeirTax)}</p>
          <p className="text-green">+ Roth IRA (tax-free): {toUSD(blueFinalRoth)}</p>
          <p>+ Taxable Account: {toUSD(Math.max(0, blueFinalTaxable))}</p>
          <p className="border-t border-gold-border pt-2 text-gold font-medium">
            = Net Legacy: {toUSD(blueNetLegacy)}
          </p>
        </div>
      </div>

      <p className="text-text-muted text-xs">
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
      <p className="text-foreground font-medium">What are Total Taxes Paid?</p>
      <p>
        This includes all taxes paid by you AND your heirs over the projection period—income taxes on
        distributions/conversions, Medicare IRMAA surcharges, and the taxes your heirs pay on inherited IRAs.
      </p>

      <div className="bg-bg-card rounded-lg p-4 space-y-3">
        <p className="text-foreground font-medium text-xs uppercase tracking-wider">Baseline Taxes</p>
        <div className="space-y-1 font-mono text-sm">
          <p>Income Tax on RMDs: {toUSD(baseTax)}</p>
          <p>Medicare IRMAA Surcharges: {toUSD(baseIrmaa)}</p>
          <p>Heir's Tax on Inheritance ({heirTaxPct}%): {toUSD(baseHeirTax)}</p>
          <p className="border-t border-border-default pt-2 text-red font-medium">
            = Total Taxes: {toUSD(baseTotalTaxes)}
          </p>
        </div>
      </div>

      <div className="bg-accent border border-gold-border rounded-lg p-4 space-y-3">
        <p className="text-gold font-medium text-xs uppercase tracking-wider">Strategy Taxes</p>
        <div className="space-y-1 font-mono text-sm">
          <p>Income Tax on Conversions: {toUSD(blueTax)}</p>
          <p className="text-xs text-text-muted">
            (Converted {toUSD(blueConversions)} staying in {client.max_tax_rate}% bracket)
          </p>
          <p>Medicare IRMAA Surcharges: {toUSD(blueIrmaa)}</p>
          <p>Heir's Tax on Remaining Traditional ({heirTaxPct}%): {toUSD(blueHeirTax)}</p>
          <p className="border-t border-gold-border pt-2 text-gold font-medium">
            = Total Taxes: {toUSD(blueTotalTaxes)}
          </p>
        </div>
      </div>

      <div className={cn(
        "rounded-lg p-4",
        taxSavings > 0
          ? "bg-green-bg border border-green/20"
          : "bg-red-bg border border-red/20"
      )}>
        <p className={taxSavings > 0 ? "text-green font-medium" : "text-red font-medium"}>
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
      <p className="text-foreground font-medium">
        {rmdTreatment === 'spent' ? "What are After-Tax Distributions?" : "What are Gross Distributions?"}
      </p>

      {rmdTreatment === 'spent' ? (
        <>
          <p>
            After-Tax Distributions represent the actual money you received and spent during retirement
            from Required Minimum Distributions, after paying income taxes on them.
          </p>
          <div className="bg-bg-card rounded-lg p-4 space-y-2">
            <p className="font-mono text-sm">Gross RMDs Taken: {toUSD(baseRMDs)}</p>
            <p className="font-mono text-sm">After Taxes: {toUSD(baseCumulativeDistributions)}</p>
          </div>
          <p className="text-text-muted text-xs">
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
          <div className="bg-bg-card rounded-lg p-4 space-y-2">
            <p className="font-mono text-sm">Total Gross RMDs: {toUSD(baseRMDs)}</p>
            <p className="text-xs text-text-muted">
              (These are taxed as ordinary income each year)
            </p>
          </div>
        </>
      )}

      <div className="bg-accent border border-gold-border rounded-lg p-4">
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

  // Check if surrender values are present
  const hasSurrenderValues = years.some(row => row.surrenderValue != null);

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
          <th className="text-left px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">Year</th>
          <th className="text-left px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">Age</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">Trad BOY</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">Converted</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">Taxes</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">Trad EOY</th>
          {hasSurrenderValues && (
            <th className="text-right px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">SV</th>
          )}
          <th className="text-right px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">Roth EOY</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">Net Worth</th>
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
                "border-b border-border-default/50 hover:bg-bg-card transition-colors",
                hasConversion && "border-l-[3px] border-l-gold"
              )}
            >
              <td className="px-4 py-3 text-sm font-mono text-text-dim">{row.year}</td>
              <td className="px-4 py-3 text-sm text-text-muted">{row.age}</td>
              <td className="px-4 py-3 text-sm font-mono text-right text-text-muted">
                {toUSD(tradBOY)}
              </td>
              <td className={cn(
                "px-4 py-3 text-sm font-mono text-right",
                hasConversion ? "text-gold" : "text-text-dim"
              )}>
                {hasConversion ? toUSD(row.conversionAmount) : "—"}
              </td>
              <td className="px-4 py-3 text-sm font-mono text-right text-red">
                {toUSD(row.federalTax + row.stateTax)}
              </td>
              <td className="px-4 py-3 text-sm font-mono text-right text-text-muted">
                {toUSD(row.traditionalBalance)}
              </td>
              {hasSurrenderValues && (
                <td className="px-4 py-3 text-sm font-mono text-right text-text-dim">
                  {row.surrenderValue != null ? (
                    <span title={`${row.surrenderChargePercent ?? 0}% charge`}>
                      {toUSD(row.surrenderValue)}
                    </span>
                  ) : "—"}
                </td>
              )}
              <td className={cn(
                "px-4 py-3 text-sm font-mono text-right",
                row.rothBalance > 0 ? "text-green" : "text-text-dim"
              )}>
                {row.rothBalance > 0 ? toUSD(row.rothBalance) : "—"}
              </td>
              <td className="px-4 py-3 text-sm font-mono text-right text-foreground">
                {toUSD(row.netWorth)}
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="bg-bg-input border-t border-border-default">
          <td className="px-4 py-3 text-sm font-semibold text-foreground" colSpan={3}>TOTALS</td>
          <td className="px-4 py-3 text-sm font-mono text-right font-semibold text-gold">
            {toUSD(totalConverted)}
          </td>
          <td className="px-4 py-3 text-sm font-mono text-right font-semibold text-red">
            {toUSD(totalTaxes)}
          </td>
          <td className="px-4 py-3 text-sm font-mono text-right text-text-muted" colSpan={hasSurrenderValues ? 4 : 3}>—</td>
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
          <th className="text-left px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">Year</th>
          <th className="text-left px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">Age</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">Trad BOY</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">RMD</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">Taxes</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">Trad EOY</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">Net Worth</th>
        </tr>
      </thead>
      <tbody>
        {years.map((row, idx) => {
          const tradBOY = getBOY(idx);
          return (
            <tr
              key={row.year}
              className="border-b border-border-default/50 hover:bg-bg-card transition-colors"
            >
              <td className="px-4 py-3 text-sm font-mono text-text-dim">{row.year}</td>
              <td className="px-4 py-3 text-sm text-text-muted">{row.age}</td>
              <td className="px-4 py-3 text-sm font-mono text-right text-text-muted">
                {toUSD(tradBOY)}
              </td>
              <td className={cn(
                "px-4 py-3 text-sm font-mono text-right",
                row.rmdAmount > 0 ? "text-text-dim" : "text-text-dim"
              )}>
                {row.rmdAmount > 0 ? toUSD(row.rmdAmount) : "—"}
              </td>
              <td className="px-4 py-3 text-sm font-mono text-right text-red">
                {toUSD(row.federalTax + row.stateTax)}
              </td>
              <td className="px-4 py-3 text-sm font-mono text-right text-text-muted">
                {toUSD(row.traditionalBalance)}
              </td>
              <td className="px-4 py-3 text-sm font-mono text-right text-foreground">
                {toUSD(row.netWorth)}
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="bg-bg-input border-t border-border-default">
          <td className="px-4 py-3 text-sm font-semibold text-foreground" colSpan={3}>TOTALS</td>
          <td className="px-4 py-3 text-sm font-mono text-right font-semibold text-foreground">
            {toUSD(totalRMDs)}
          </td>
          <td className="px-4 py-3 text-sm font-mono text-right font-semibold text-red">
            {toUSD(totalTaxes)}
          </td>
          <td className="px-4 py-3 text-sm font-mono text-right text-text-muted" colSpan={2}>—</td>
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
          <th className="text-left px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">Year</th>
          <th className="text-left px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">Age</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">Baseline</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">Strategy</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">Roth</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">Total</th>
          <th className="text-right px-4 py-3 text-xs uppercase text-text-muted tracking-[1px] font-medium">Difference</th>
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
              className="border-b border-border-default/50 hover:bg-bg-card transition-colors"
            >
              <td className="px-4 py-3 text-sm font-mono text-text-dim">{stratRow.year}</td>
              <td className="px-4 py-3 text-sm text-text-muted">{stratRow.age}</td>
              <td className="px-4 py-3 text-sm font-mono text-right text-text-dim">
                {toUSD(baseRow.traditionalBalance)}
              </td>
              <td className="px-4 py-3 text-sm font-mono text-right text-text-muted">
                {toUSD(stratRow.traditionalBalance)}
              </td>
              <td className={cn(
                "px-4 py-3 text-sm font-mono text-right",
                stratRow.rothBalance > 0 ? "text-green" : "text-text-dim"
              )}>
                {stratRow.rothBalance > 0 ? toUSD(stratRow.rothBalance) : "—"}
              </td>
              <td className="px-4 py-3 text-sm font-mono text-right text-foreground">
                {toUSD(strategyTotal)}
              </td>
              <td className={cn(
                "px-4 py-3 text-sm font-mono text-right font-medium",
                diff >= 0 ? "text-green" : "text-red"
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
