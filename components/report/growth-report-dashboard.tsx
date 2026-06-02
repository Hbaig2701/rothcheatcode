"use client";

import { useState, ReactNode } from "react";
import type { Projection } from "@/lib/types/projection";
import type { Client } from "@/lib/types/client";
import type { YearlyResult } from "@/lib/calculations";
import { WealthChart } from "@/components/results/wealth-chart";
import { transformToChartData } from "@/lib/calculations/transforms";
import { ChevronDown, ChevronUp, Info, X, Settings2, Loader2 } from "lucide-react";
import { useUpdateClient } from "@/lib/queries/clients";
import { cn } from "@/lib/utils";
import { ALL_PRODUCTS, type FormulaType } from "@/lib/config/products";
import { computeMarginalRMDTax } from "@/lib/calculations/marginal-rmd-tax";
import { ResizableTable } from "@/components/results/deep-dive/resizable-table";
import { ResizableComparisonTable } from "@/components/results/deep-dive/resizable-comparison-table";
import { ColumnSelectorModal } from "@/components/results/deep-dive/column-selector-modal";
import { COLUMN_DEFINITIONS } from "@/lib/table-columns/column-definitions";
import { resolveColumnPreferences, saveColumnPreferences, getDefaultColumns } from "@/lib/table-columns/storage";
import { AdvancedFeaturesSection } from "@/components/results/advanced-features-section";
import { WidowSection } from "@/components/report/widow-section";

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
  const updateClient = useUpdateClient();

  // Column preferences are SHARED across the Strategy / Baseline / Comparison
  // table views — advisors expect the columns they configure on one view to
  // stay consistent when they toggle to another. Storage key is per-client
  // so each client keeps its own selection and widths.
  const columnStorageKey = `growth-report-${client.id}`;

  // Column customization state. Lookup chain on initial mount:
  //   per-client saved → user "favourite columns" default (Settings → My
  //   Columns) → built-in DEFAULT_PRESETS. SSR fallback returns the
  //   built-in preset so the server-rendered tree matches the first client
  //   paint when no preferences exist.
  const [selectedColumns, setSelectedColumns] = useState<string[]>(() => {
    if (typeof window === 'undefined') return getDefaultColumns("growth");
    return resolveColumnPreferences(columnStorageKey, "growth").selectedColumns;
  });

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {};
    return resolveColumnPreferences(columnStorageKey, "growth").columnWidths;
  });

  // (No useEffect-on-tableView — column state persists as the user switches
  // views, matching advisor expectation that selection is global to the client.)

  const handleSaveColumns = (columns: string[]) => {
    setSelectedColumns(columns);
    saveColumnPreferences(columnStorageKey, {
      selectedColumns: columns,
      columnWidths,
      lastUpdated: new Date().toISOString(),
    });
  };

  // Build columns in the user-chosen order (frozen first). Filtering COLUMN_DEFINITIONS
  // by `selectedColumns.includes(...)` returns columns in the constants-file order, which
  // silently ignores the user's reorder. Mapping selectedColumns through a lookup
  // preserves the order the user actually picked.
  // When the client isn't married, suppress the Spouse Age column even if a
  // prior preference toggled it on.
  const isMarriedFiler = client.filing_status === "married_filing_jointly"
    || client.filing_status === "married_filing_separately";
  const orderedColumns = (() => {
    const defMap = new Map(COLUMN_DEFINITIONS.map((c) => [c.id, c]));
    const resolved = selectedColumns
      .filter((id) => isMarriedFiler || id !== "spouseAge")
      .map((id) => defMap.get(id))
      .filter(Boolean) as typeof COLUMN_DEFINITIONS;
    const frozen = resolved.filter((c) => c.frozen);
    const nonFrozen = resolved.filter((c) => !c.frozen);
    return [...frozen, ...nonFrozen];
  })();

  const handleWidthChange = (columnId: string, width: number) => {
    const newWidths = { ...columnWidths, [columnId]: width };
    setColumnWidths(newWidths);
    saveColumnPreferences(columnStorageKey, {
      selectedColumns,
      columnWidths: newWidths,
      lastUpdated: new Date().toISOString(),
    });
  };

  const heirTaxRate = (client.heir_tax_rate ?? 40) / 100;
  // Pass the client's heir tax rate so the chart lines match the breakeven
  // numbers computed elsewhere (stat card, Advanced Analysis tab). Default
  // 0.40 would make the reference line and the visible crossover disagree
  // for any client with a custom heir_tax_rate.
  const chartData = transformToChartData(projection, heirTaxRate);

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
  // Marginal RMD-attributable portion of baseline tax — the tax dollars caused
  // BY the RMDs themselves, isolated from background tax on SS/non-SSI income
  // the client owes regardless. Without this isolation, a label like
  // "Income tax on RMDs" silently lumps in tax on all other income — the
  // asymmetry advisors keep catching on the dashboard tooltips. Same helper
  // backs the PDF "Tax on RMDs" row, so all surfaces stay in sync.
  const baseRMDTaxOnly = computeMarginalRMDTax(projection.baseline_years, client);
  // Same idea for strategy: when a strategy doesn't fully convert (partial /
  // optimized / fixed), there are still RMDs in the post-conversion phase,
  // and the tax on those is its own line — separate from conversion tax and
  // separate from background income tax.
  const blueRMDTaxOnly = computeMarginalRMDTax(projection.blueprint_years, client);
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

  // Lifetime Wealth = net legacy (apples-to-apples vs strategy).
  // Previously, when rmd_treatment === 'spent', baseline lifetime wealth added
  // cumulative after-tax RMDs to net legacy, but strategy never got an
  // analogous credit for its tax-free Roth balance. That asymmetry made the
  // strategy look weaker than the legacy comparison actually was.
  // The "spent" mode still affects engine simulation (RMDs leave the taxable
  // account) and is still surfaced in the Distributions card below.
  const baseLifetimeWealth = baseNetLegacy;
  const baseTotalTaxes = baseTax + baseIrmaa + baseHeirTax;

  // Strategy calculations
  const blueConversions = sum(projection.blueprint_years, "conversionAmount");
  const blueTax = sum(projection.blueprint_years, "federalTax") + sum(projection.blueprint_years, "stateTax");
  // True conversion-only tax (federal + state). Distinct from blueTax, which
  // also rolls up ordinary-income tax on Social Security, non-SSI income,
  // RMDs after the conversion phase, and state tax on all of those. Use this
  // wherever the label says "conversion tax" — using blueTax there inflated
  // the conversion cost by every other strategy tax line.
  const blueConversionTax = sum(projection.blueprint_years, "federalTaxOnConversions") + sum(projection.blueprint_years, "stateTaxOnConversions");
  const blueIrmaa = sum(projection.blueprint_years, "irmaaSurcharge");
  // Early-withdrawal penalty is its own tax line — combineRothAndAum sums
  // both engines' contributions, so this reads the full Roth+AUM lifetime
  // penalty when AUM is active and only the Roth side when it isn't.
  const blueEarlyPenalty = sum(projection.blueprint_years, "earlyWithdrawalPenalty");
  const blueFinalTraditional = projection.blueprint_final_traditional;
  const blueFinalRoth = projection.blueprint_final_roth;
  // Heir tax only applies to remaining traditional IRA (if any)
  const blueHeirTax = Math.round(blueFinalTraditional * heirTaxRate);
  // Net legacy = final net worth minus heir taxes on traditional
  const blueNetLegacy = projection.blueprint_final_net_worth - blueHeirTax;
  // Lifetime wealth = net legacy (conversion taxes/IRMAA already deducted from taxable in engine)
  const blueLifetimeWealth = blueNetLegacy;
  // Lifetime tax cost includes the 10% early-withdrawal penalty alongside
  // income tax + IRMAA + heir tax. Without the penalty line the card would
  // under-state the actual cash cost when AUM is on under 59½.
  const blueTotalTaxes = blueTax + blueIrmaa + blueHeirTax + blueEarlyPenalty;

  // Differences
  const lifetimeWealthDiff = blueLifetimeWealth - baseLifetimeWealth;
  const lifetimeWealthPct = baseLifetimeWealth !== 0 ? lifetimeWealthDiff / Math.abs(baseLifetimeWealth) : 0;
  const taxSavings = baseTotalTaxes - blueTotalTaxes;
  const legacyDiff = blueNetLegacy - baseNetLegacy;

  // ===== AUM split-allocation metrics =====
  // The AUM bucket is stored separately on the projection so we can describe
  // it independently in tooltips ("how much got pulled from the IRA, how much
  // tax was paid on the transfer, what's the bucket worth at death").
  const aumActive = (client.aum_allocation_percent ?? 0) > 0 && !!projection.aum_years;
  const aumYears = projection.aum_years ?? [];
  const aumStartingPortion = Math.round((client.qualified_account_value ?? 0) * ((client.aum_allocation_percent ?? 0) / 100));
  const aumTotalWithdrawnFromIra = aumYears.reduce((s, y) => s + (y.iraWithdrawal ?? 0), 0);
  const aumTotalTaxPaid = aumYears.reduce((s, y) => s + y.totalTax, 0);
  const aumEarlyWithdrawalPenalty = aumYears.reduce((s, y) => s + (y.earlyWithdrawalPenalty ?? 0), 0);
  const aumFinalBalance = projection.aum_final_balance ?? 0;
  const rothSidePortion = (client.qualified_account_value ?? 0) - aumStartingPortion;

  // ===== Voluntary withdrawal metrics =====
  // The withdrawal schedule is independent from RMDs/conversions. Surface the
  // totals so the tooltip can explain the impact on the strategy bucket.
  const blueIraVoluntaryWithdrawals = sum(projection.blueprint_years, "iraWithdrawal");
  const blueRothVoluntaryWithdrawals = sum(projection.blueprint_years, "rothWithdrawal");
  // The AUM IRA-to-AUM transfer also lands in iraWithdrawal — strip that out
  // so the "voluntary advisor-scheduled" total is just the schedule-driven pulls.
  const blueScheduledIraWithdrawals = blueIraVoluntaryWithdrawals - aumTotalWithdrawnFromIra;
  // Brokerage-spending withdrawals: the AUM bucket absorbs IRA-side requests
  // the Roth-side IRA couldn't satisfy (typical with high AUM allocation).
  // Surface this as a third leg so the advisor sees the full lifetime
  // withdrawal picture even when the qualified balance was redirected to AUM.
  const blueAumScheduledWithdrawals = sum(projection.blueprint_years, "aumScheduledWithdrawal");
  const hasVoluntaryWithdrawals = (client.withdrawals?.length ?? 0) > 0
    && (blueScheduledIraWithdrawals > 0 || blueRothVoluntaryWithdrawals > 0 || blueAumScheduledWithdrawals > 0);

  // ===== Conversion-type description for tooltips =====
  const conversionType = client.conversion_type ?? 'optimized_amount';
  const partialTarget = client.target_partial_amount ?? 0;
  const fixedAmount = client.fixed_conversion_amount ?? 0;
  const conversionTypeDescription = (() => {
    switch (conversionType) {
      case 'no_conversion':
        return `No conversions are made. The strategy reduces to baseline behavior.`;
      case 'full_conversion':
        return `The IRA is converted in full as soon as the engine can, paying the resulting tax bill upfront.`;
      case 'fixed_amount':
        return `Convert ${toUSD(fixedAmount)} every year (or remaining balance if less).`;
      case 'partial_amount':
        return `Convert optimally each year, capping cumulative conversions at ${toUSD(partialTarget)}.`;
      case 'optimized_amount':
      default:
        return `Each year, fill up to the target ${client.max_tax_rate ?? 24}% bracket. Continues until the IRA is empty or the projection ends.`;
    }
  })();

  // ===== Tax payment source =====
  // 'from_ira' grosses down the conversion (tax is also pulled from the IRA,
  // which can trigger a 10% early-withdrawal penalty under 59½) and shifts
  // tax expense from the taxable account to the IRA itself. 'from_taxable'
  // means the client writes the tax check from outside funds.
  const taxPaymentSource = client.tax_payment_source ?? 'from_taxable';
  const conversionTaxesFromIRA = sum(projection.blueprint_years, 'taxesPaidFromIRA');
  // Carrier penalty-free cap overflow — the portion of conversion tax that
  // the IRA couldn't cover (because the carrier limits internal distributions
  // during the surrender period) and was assumed funded externally. Zero
  // unless respect_penalty_free_limit + tax_payment_source = from_ira are
  // both active and the cap binds in at least one year.
  const conversionTaxesPaidExternally = sum(projection.blueprint_years, 'taxesPaidExternally');
  const carrierCapOverflowActive = conversionTaxesPaidExternally > 0;
  // Reuses the same combined Roth+AUM penalty already computed up at the
  // strategy-metrics block; aliased here so the existing prop name stays.
  const blueEarlyWithdrawalPenalty = blueEarlyPenalty;

  // ===== Constraint / deferral / penalty-free cap =====
  // (penaltyFreePercent / surrenderYears are also defined further down in
  // their decimal/raw forms for the surrender-violation calculation; we read
  // the raw client values directly here to keep tooltip props readable.)
  const yearsToDefer = client.years_to_defer_conversion ?? 0;
  const constraintType = client.constraint_type ?? 'none';
  const respectPenaltyFreeLimit = client.respect_penalty_free_limit ?? false;
  const penaltyFreePercentForTooltip = client.penalty_free_percent ?? 10;
  const surrenderYearsForTooltip = client.surrender_years ?? 0;

  // ===== Widow analysis =====
  // When enabled, the projection switches the surviving spouse to single
  // filing status starting at widow_death_age (or the heuristic default).
  // That spike in baseline RMD taxation is a major driver of the strategy's
  // advantage and should be called out.
  const widowAnalysisActive = client.widow_analysis === true;
  const widowDeathAge = client.widow_death_age ?? null;

  // ===== Anniversary bonus =====
  const hasAnniversaryBonus = client.anniversary_bonus_percent != null
    && client.anniversary_bonus_years != null
    && client.anniversary_bonus_percent > 0;

  // ===== Non-SSI income / surrender period rate =====
  const hasNonSsiIncome = (client.non_ssi_income?.length ?? 0) > 0;
  const postContractRate = client.post_contract_rate ?? client.rate_of_return ?? 7;
  const surrenderRateDiffers = postContractRate !== (client.rate_of_return ?? 7);

  // Conversion years data
  const conversionYears = projection.blueprint_years.filter(y => y.conversionAmount > 0);
  const avgTaxRate = blueConversions > 0 ? (blueConversionTax / blueConversions) * 100 : 0;

  // Penalty-free withdrawal check. Per Joshua W.'s clarification (ticket
  // 2b5ff7a4), the carrier penalty-free allowance restricts dollars actually
  // DISTRIBUTED out of the policy — not the conversion amount itself, since
  // a Roth conversion is an intra-carrier Trad → Roth transfer that doesn't
  // count against the allowance. The dollars that DO count are
  // taxesPaidFromIRA (the conversion tax pulled out of the contract). So the
  // violation comparison is taxesPaidFromIRA vs the cap. When
  // respect_penalty_free_limit is on, the engine routes overflow to external
  // funds and the cap is never exceeded — no violations to surface. When
  // it's off (and the advisor is paying tax from the IRA), we compute how
  // much the year's tax distribution would actually exceed the cap and what
  // surrender charge would apply.
  const penaltyFreePercent = (client.penalty_free_percent ?? 10) / 100;
  const surrenderYears = client.surrender_years ?? 0;
  const surrenderSchedule = client.surrender_schedule ?? [];
  const hasSurrenderSchedule = surrenderSchedule.length > 0 && surrenderSchedule.some(v => v > 0);
  const checkPenaltyFreeViolations =
    hasSurrenderSchedule
    && (client.tax_payment_source === 'from_ira')
    && !(client.respect_penalty_free_limit ?? false);
  const penaltyFreeViolations = !checkPenaltyFreeViolations ? [] : projection.blueprint_years
    .map((year, idx) => {
      const taxFromIra = year.taxesPaidFromIRA ?? 0;
      if (taxFromIra <= 0) return null;
      const yearOffset = idx;
      if (yearOffset >= surrenderYears) return null; // Past surrender period
      // BOY IRA balance: previous year's end balance, or initial deposit + bonus for year 0
      const boyIRA = idx > 0
        ? projection.blueprint_years[idx - 1].traditionalBalance
        : Math.round((client.qualified_account_value ?? 0) * (1 + (client.bonus_percent ?? 0) / 100));
      const penaltyFreeLimit = Math.round(boyIRA * penaltyFreePercent);
      if (taxFromIra > penaltyFreeLimit) {
        const excess = taxFromIra - penaltyFreeLimit;
        const chargePercent = yearOffset < surrenderSchedule.length ? surrenderSchedule[yearOffset] : 0;
        const estimatedCharge = Math.round(excess * chargePercent / 100);
        return {
          year: year.year,
          age: year.age,
          // Surface the tax-from-IRA as the offending distribution; conversion
          // is shown for context but isn't itself the trigger.
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

  // Display the actual top marginal bracket the conversion years reached.
  // Previously this returned client.tax_rate, which is the CURRENT (pre-
  // conversion) bracket and bears no relation to where the conversion
  // actually lands the client. For a full_conversion the engine fills
  // brackets all the way up to whatever the gross-up requires — saying
  // "Stay in the 24% bracket" when the client is actually hitting 37% is
  // misleading. (Scott Kenik ticket 5adba41e.)
  const getTargetBracket = () => {
    if (conversionYears.length === 0) return "N/A";
    const maxReached = conversionYears.reduce(
      (acc, y) => Math.max(acc, y.federalTaxBracket ?? 0),
      0
    );
    if (maxReached > 0) return `${maxReached}%`;
    // Fall back to the configured ceiling if the engine didn't surface a
    // marginal bracket on any conversion year (older projections). The
    // CEILING is max_tax_rate — tax_rate is the "Current Bracket" reference
    // field which has no bearing on what the strategy targeted. v1 had the
    // order reversed and would render "24%" when the advisor configured
    // max_tax_rate=32.
    const rate = client.max_tax_rate ?? client.tax_rate ?? 24;
    return `${rate}%`;
  };

  // Word the surrounding sentence to match the actual strategy. A "Stay in
  // X%" framing fits a bracket-ceiling / optimized strategy where the
  // engine deliberately caps fill; for a full_conversion, the rate is the
  // top bracket that got hit, not a ceiling the strategy stayed under.
  const targetBracketPrefix = client.conversion_type === 'full_conversion'
    ? 'Reaches the'
    : 'Stay in the';

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
            {blueConversions > 0 ? (
              <>
                <p className="text-base text-text-muted">
                  Convert {toUSD(blueConversions)} over {conversionYears.length} years · {targetBracketPrefix} {getTargetBracket()} bracket
                </p>
                <p className="text-sm text-text-dim mt-1">
                  Projected final Roth balance: {toUSD(blueFinalRoth)} (tax-free)
                </p>
              </>
            ) : (
              // 100% allocation to AUM — nothing flows through the Roth
              // conversion engine, so the "convert $X" copy would be
              // nonsense ("Convert $0 over 0 years"). Show a tighter
              // sentence that matches what the strategy actually is.
              <p className="text-base text-text-muted">
                No Roth conversion this scenario · Full balance routed to AUM brokerage
              </p>
            )}
            {(client.aum_allocation_percent ?? 0) > 0 && projection.aum_years && (
              <p className="text-sm text-gold mt-2">
                Split allocation:&nbsp;
                <span className="font-medium">{(100 - (client.aum_allocation_percent ?? 0)).toFixed(0)}%</span>
                &nbsp;Roth conversion ·&nbsp;
                <span className="font-medium">{(client.aum_allocation_percent ?? 0).toFixed(0)}%</span>
                &nbsp;AUM (final balance {toUSD(projection.aum_final_balance ?? 0)})
              </p>
            )}
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
                baseRMDTaxOnly={baseRMDTaxOnly}
                baseRMDs={baseRMDs}
                blueFinalTraditional={blueFinalTraditional}
                blueFinalRoth={blueFinalRoth}
                blueHeirTax={blueHeirTax}
                blueNetLegacy={blueNetLegacy}
                blueLifetimeWealth={blueLifetimeWealth}
                blueTax={blueTax}
                blueConversionTax={blueConversionTax}
                blueConversions={blueConversions}
                rmdTreatment={rmdTreatment}
                heirTaxRate={heirTaxRate}
                aumActive={aumActive}
                aumStartingPortion={aumStartingPortion}
                aumTotalWithdrawnFromIra={aumTotalWithdrawnFromIra}
                aumTotalTaxPaid={aumTotalTaxPaid}
                aumFinalBalance={aumFinalBalance}
                rothSidePortion={rothSidePortion}
                conversionType={conversionType}
                conversionTypeDescription={conversionTypeDescription}
                hasVoluntaryWithdrawals={hasVoluntaryWithdrawals}
                blueScheduledIraWithdrawals={blueScheduledIraWithdrawals}
                blueRothVoluntaryWithdrawals={blueRothVoluntaryWithdrawals}
                blueAumScheduledWithdrawals={blueAumScheduledWithdrawals}
                taxPaymentSource={taxPaymentSource}
                conversionTaxesFromIRA={conversionTaxesFromIRA}
                conversionTaxesPaidExternally={conversionTaxesPaidExternally}
                carrierCapOverflowActive={carrierCapOverflowActive}
                blueEarlyWithdrawalPenalty={blueEarlyWithdrawalPenalty}
                yearsToDefer={yearsToDefer}
                constraintType={constraintType}
                respectPenaltyFreeLimit={respectPenaltyFreeLimit}
                penaltyFreePercent={penaltyFreePercentForTooltip}
                surrenderYears={surrenderYearsForTooltip}
                widowAnalysisActive={widowAnalysisActive}
                widowDeathAge={widowDeathAge}
                hasAnniversaryBonus={hasAnniversaryBonus}
                hasNonSsiIncome={hasNonSsiIncome}
                postContractRate={postContractRate}
                surrenderRateDiffers={surrenderRateDiffers}
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
                aumActive={aumActive}
                aumFinalBalance={aumFinalBalance}
                widowAnalysisActive={widowAnalysisActive}
                widowDeathAge={widowDeathAge}
              />
            }
          />
          <ComparisonCard
            label="Lifetime Tax Cost (incl. heir tax)"
            baseline={baseTotalTaxes}
            strategy={blueTotalTaxes}
            invertColor
            infoContent={
              <TotalTaxesInfo
                client={client}
                baseTax={baseTax}
                baseRMDTaxOnly={baseRMDTaxOnly}
                baseIrmaa={baseIrmaa}
                baseHeirTax={baseHeirTax}
                baseTotalTaxes={baseTotalTaxes}
                blueTax={blueTax}
                blueConversionTax={blueConversionTax}
                blueRMDTaxOnly={blueRMDTaxOnly}
                blueIrmaa={blueIrmaa}
                blueHeirTax={blueHeirTax}
                blueTotalTaxes={blueTotalTaxes}
                blueConversions={blueConversions}
                heirTaxRate={heirTaxRate}
                aumActive={aumActive}
                aumTotalTaxPaid={aumTotalTaxPaid}
                aumEarlyWithdrawalPenalty={aumEarlyWithdrawalPenalty}
                conversionType={conversionType}
                taxPaymentSource={taxPaymentSource}
                conversionTaxesFromIRA={conversionTaxesFromIRA}
                conversionTaxesPaidExternally={conversionTaxesPaidExternally}
                carrierCapOverflowActive={carrierCapOverflowActive}
                blueEarlyWithdrawalPenalty={blueEarlyWithdrawalPenalty}
                constraintType={constraintType}
                widowAnalysisActive={widowAnalysisActive}
                widowDeathAge={widowDeathAge}
              />
            }
          />
          <ComparisonCard
            label={rmdTreatment === 'spent' ? "Forced Distributions (After-Tax)" : "Forced Distributions"}
            baseline={rmdTreatment === 'spent' ? baseCumulativeDistributions : baseRMDs}
            strategy={0}
            invertColor={rmdTreatment !== 'spent'}
            infoContent={
              <DistributionsInfo
                client={client}
                baseRMDs={baseRMDs}
                baseCumulativeDistributions={baseCumulativeDistributions}
                rmdTreatment={rmdTreatment}
                aumActive={aumActive}
                aumTotalWithdrawnFromIra={aumTotalWithdrawnFromIra}
                aumStartingPortion={aumStartingPortion}
                hasVoluntaryWithdrawals={hasVoluntaryWithdrawals}
                blueScheduledIraWithdrawals={blueScheduledIraWithdrawals}
                blueRothVoluntaryWithdrawals={blueRothVoluntaryWithdrawals}
                blueAumScheduledWithdrawals={blueAumScheduledWithdrawals}
                yearsToDefer={yearsToDefer}
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
                  {/* Marginal federal bracket the engine actually reached in this
                      conversion year. Falls back to the configured ceiling
                      (max_tax_rate) for older cached projections that didn't
                      surface federalTaxBracket per year. The previous version
                      hardcoded client.tax_rate, which is the "Current Bracket
                      (informational)" field — same number for every tile,
                      regardless of where the engine actually landed. Greg
                      Stopp flagged this on Policar's report (saw "24%" on
                      every tile while the strategy summary correctly said
                      "Stay in the 32% bracket"). */}
                  <p className="text-sm font-mono text-foreground mt-2">
                    {year.federalTaxBracket ?? client.max_tax_rate ?? 24}%
                  </p>
                  <p className="text-xs text-text-dim">Bracket</p>
                </div>
              ))}
            </div>

            {/* Summary Row */}
            <div className="pt-5 border-t border-border-default">
              <p className="text-sm text-text-muted">
                Total Converted: <span className="font-mono text-foreground">{toUSD(blueConversions)}</span>
                {" · "}
                Total Conversion Taxes: <span className="font-mono text-foreground">{toUSD(blueConversionTax)}</span>
                {" · "}
                Avg Tax Rate: <span className="font-mono text-foreground">{avgTaxRate.toFixed(1)}%</span>
              </p>
            </div>
          </div>
        )}

        {/* Penalty-Free Withdrawal Warning — collapsed by default */}
        {penaltyFreeViolations.length > 0 && (
          <details className="group bg-[rgba(250,204,21,0.06)] border border-[rgba(250,204,21,0.25)] rounded-[14px]">
            <summary className="flex items-center gap-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden p-6">
              <div className="shrink-0 w-8 h-8 rounded-full bg-[rgba(250,204,21,0.15)] flex items-center justify-center">
                <span className="text-base">⚠️</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Penalty-Free Withdrawal Limit Exceeded
                  <span className="ml-2 text-xs font-normal text-text-muted">
                    ({penaltyFreeViolations.length} year{penaltyFreeViolations.length !== 1 ? "s" : ""} &middot; Est. {toUSD(penaltyFreeViolations.reduce((s, v) => s + v.estimatedCharge, 0))} in charges)
                  </span>
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  Click to view details
                </p>
              </div>
              <svg
                className="size-5 text-foreground/50 transition-transform group-open:rotate-180 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="px-6 pb-6 pt-0">
              <div className="mb-4 space-y-2">
                <p className="text-xs text-text-muted">
                  In these years the conversion tax pulled from the IRA exceeds the {client.penalty_free_percent ?? 10}% annual penalty-free
                  withdrawal allowance during the surrender period — surrender charges may apply to the excess.
                  (Note: whether the conversion itself ALSO counts against the allowance depends on
                  the carrier&apos;s contract. The toggle below has a sub-option for the strict interpretation.)
                </p>
                {!respectPenaltyFreeLimit && (
                  <p className="text-xs text-text-muted">
                    <span className="text-foreground font-medium">Why this is showing:</span>{" "}
                    The &quot;Respect Contract Penalty-Free Limit&quot; toggle (in section 4 Tax Data) is currently <span className="text-red font-medium">off</span>,
                    so the engine is pulling the full conversion tax from the IRA in each conversion year — even when that exceeds the cap.
                    Turn it on to cap the IRA outflow at {client.penalty_free_percent ?? 10}% of the prior anniversary value. You can
                    then choose whether the cap restricts just the tax payment (default, intra-carrier conversion exempt)
                    or every dollar that leaves the IRA (strict, conversion counts too).
                  </p>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[rgba(250,204,21,0.2)]">
                      <th className="text-left py-2 px-3 text-xs font-medium text-text-muted">Year</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-text-muted">Age</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-text-muted">Conversion (context)</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-text-muted">Penalty-Free Limit (on tax)</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-text-muted">Tax-from-IRA Excess</th>
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
              {!respectPenaltyFreeLimit ? (
                <div className="mt-4 flex items-start gap-3 rounded-lg border border-gold/30 bg-gold/5 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">One-click fix</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      Cap the per-year tax-from-IRA at the {client.penalty_free_percent ?? 10}% penalty-free allowance and route any overflow
                      to external funds. The conversion stays at the chosen size.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateClient.mutate({ id: client.id, data: { respect_penalty_free_limit: true } })}
                    disabled={updateClient.isPending}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-bg-base hover:bg-gold/90 disabled:opacity-60 transition-colors"
                  >
                    {updateClient.isPending ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        Applying…
                      </>
                    ) : (
                      "Stay within limit"
                    )}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-text-dimmer mt-3 italic">
                  &quot;Stay within penalty-free limit&quot; is on but your strategy is still pushing conversions above the {client.penalty_free_percent ?? 10}% cap — check the conversion type / fixed amount on this scenario.
                </p>
              )}
            </div>
          </details>
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
                <span className="w-4 h-0.5 rounded" style={{ backgroundImage: "repeating-linear-gradient(90deg, var(--chart-muted) 0px, var(--chart-muted) 4px, transparent 4px, transparent 6px)" }} />
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
              {(client.bonus_percent ?? 0) > 0 && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text-muted">+ {client.bonus_percent}% Premium Bonus</span>
                    <span className="text-base font-mono text-gold">{toUSD(Math.round((client.qualified_account_value ?? 0) * (client.bonus_percent ?? 0) / 100))}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text-dim font-medium">Starting Balance (with bonus)</span>
                    <span className="text-base font-mono text-foreground">{toUSD(Math.round((client.qualified_account_value ?? 0) * (1 + (client.bonus_percent ?? 0) / 100)))}</span>
                  </div>
                </>
              )}
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
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-bg-card-hover border border-border-default rounded-lg text-foreground hover:bg-foreground/10 transition-colors"
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
                columns={orderedColumns}
                data={projection.blueprint_years}
                columnWidths={columnWidths}
                onColumnWidthChange={handleWidthChange}
                frozenColumnCount={2}
              />
            )}
            {tableView === "baseline" && (
              <ResizableTable
                columns={orderedColumns}
                data={projection.baseline_years}
                columnWidths={columnWidths}
                onColumnWidthChange={handleWidthChange}
                frozenColumnCount={2}
              />
            )}
            {tableView === "comparison" && (
              <ResizableComparisonTable
                columns={orderedColumns}
                baselineData={projection.baseline_years}
                strategyData={projection.blueprint_years}
                columnWidths={columnWidths}
                onColumnWidthChange={handleWidthChange}
                frozenColumnCount={2}
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

        {/* Section 7: Widow's Penalty Analysis (only renders if client has the
            flag enabled AND is filing MFJ — otherwise component returns null) */}
        <WidowSection client={client} />

        {/* Section 7b: Advanced Analysis (Breakeven, Sensitivity, Audit)
            — Hidden until the Breakeven framing is finalized. Widow analysis
            has been pulled out into its own dedicated section above so it
            doesn't depend on this gate. */}
        {false && <AdvancedFeaturesSection client={client} chartData={chartData} />}

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
        <div className="px-6 py-5 overflow-y-auto max-h-[60vh] text-sm text-foreground/85 space-y-4">
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
              className="p-0.5 rounded hover:bg-foreground/10 transition-colors"
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

// ============================================================
// Tooltip layout primitives
// ============================================================
// All four info modals share the same "rows of numbers with explanatory
// notes" pattern. These helpers give them consistent visual hierarchy:
// labels muted on the left, values foreground-bright on the right,
// explanatory text smaller and dimmer underneath, with proper breathing
// room between rows. Without them every line uses text-text-muted +
// font-mono and reads as a flat text dump.

type RowVariant = 'default' | 'muted' | 'positive' | 'negative' | 'subtotal' | 'total';

function TipRow({
  label,
  value,
  note,
  variant = 'default',
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  variant?: RowVariant;
}) {
  const valueColor = variant === 'positive'
    ? 'text-green'
    : variant === 'negative'
      ? 'text-red'
      : variant === 'subtotal'
        ? 'text-foreground font-medium'
        : variant === 'total'
          ? 'text-gold font-semibold'
          : variant === 'muted'
            ? 'text-text-muted'
            : 'text-foreground';
  const labelColor = variant === 'total'
    ? 'text-gold font-semibold'
    : variant === 'subtotal'
      ? 'text-foreground font-medium'
      : variant === 'muted'
        ? 'text-text-muted'
        : 'text-text-muted';
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className={cn('text-sm', labelColor)}>{label}</span>
        <span className={cn('text-sm font-mono tabular-nums', valueColor)}>{value}</span>
      </div>
      {note && (
        <p className="text-xs text-text-dim mt-1 leading-relaxed">{note}</p>
      )}
    </div>
  );
}

function TipDivider() {
  return <div className="my-1 border-t border-border-default/60" />;
}

function TipSection({
  label,
  variant = 'default',
  children,
}: {
  label: string;
  variant?: 'default' | 'gold';
  children: ReactNode;
}) {
  const headerColor = variant === 'gold' ? 'text-gold' : 'text-foreground';
  const wrapperBg = variant === 'gold'
    ? 'bg-accent border border-gold-border'
    : 'bg-bg-card border border-border-default/60';
  return (
    <div className={cn('rounded-xl p-5', wrapperBg)}>
      <p className={cn('text-[11px] font-semibold uppercase tracking-[1.5px] mb-4', headerColor)}>{label}</p>
      <div className="space-y-0.5 divide-y divide-border-default/30">
        {children}
      </div>
    </div>
  );
}

function TipNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs text-text-dim leading-relaxed mt-3 pt-3 border-t border-border-default/30">{children}</p>
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
  baseLifetimeWealth,
  baseTax,
  baseRMDTaxOnly,
  baseRMDs,
  blueFinalTraditional,
  blueFinalRoth,
  blueHeirTax,
  blueNetLegacy,
  blueLifetimeWealth,
  blueTax,
  blueConversionTax,
  blueConversions,
  heirTaxRate,
  aumActive,
  aumStartingPortion,
  aumTotalWithdrawnFromIra,
  aumTotalTaxPaid,
  aumFinalBalance,
  rothSidePortion,
  conversionType,
  conversionTypeDescription,
  hasVoluntaryWithdrawals,
  blueScheduledIraWithdrawals,
  blueRothVoluntaryWithdrawals,
  blueAumScheduledWithdrawals,
  taxPaymentSource,
  conversionTaxesFromIRA,
  conversionTaxesPaidExternally,
  carrierCapOverflowActive,
  blueEarlyWithdrawalPenalty,
  yearsToDefer,
  constraintType,
  respectPenaltyFreeLimit,
  penaltyFreePercent,
  surrenderYears,
  widowAnalysisActive,
  widowDeathAge,
  hasAnniversaryBonus,
  hasNonSsiIncome,
  postContractRate,
  surrenderRateDiffers,
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
  baseRMDTaxOnly: number;
  baseRMDs: number;
  blueFinalTraditional: number;
  blueFinalRoth: number;
  blueHeirTax: number;
  blueNetLegacy: number;
  blueLifetimeWealth: number;
  blueTax: number;
  blueConversionTax: number;
  blueConversions: number;
  rmdTreatment: string;
  heirTaxRate: number;
  aumActive: boolean;
  aumStartingPortion: number;
  aumTotalWithdrawnFromIra: number;
  aumTotalTaxPaid: number;
  aumFinalBalance: number;
  rothSidePortion: number;
  conversionType: string;
  conversionTypeDescription: string;
  hasVoluntaryWithdrawals: boolean;
  blueScheduledIraWithdrawals: number;
  blueRothVoluntaryWithdrawals: number;
  blueAumScheduledWithdrawals: number;
  taxPaymentSource: string;
  conversionTaxesFromIRA: number;
  conversionTaxesPaidExternally: number;
  carrierCapOverflowActive: boolean;
  blueEarlyWithdrawalPenalty: number;
  yearsToDefer: number;
  constraintType: string;
  respectPenaltyFreeLimit: boolean;
  penaltyFreePercent: number;
  surrenderYears: number;
  widowAnalysisActive: boolean;
  widowDeathAge: number | null;
  hasAnniversaryBonus: boolean;
  hasNonSsiIncome: boolean;
  postContractRate: number;
  surrenderRateDiffers: boolean;
}) {
  const heirTaxPct = Math.round(heirTaxRate * 100);
  const startingBalance = client.qualified_account_value ?? 0;
  const bonusAmount = Math.round(startingBalance * (client.bonus_percent ?? 0) / 100);
  const startingWithBonus = startingBalance + bonusAmount;
  const projectionYears = (client.end_age ?? 100) - (client.age ?? 62);
  const wealthDiff = blueLifetimeWealth - baseLifetimeWealth;
  const conversionStartAge = (client.age ?? 62) + yearsToDefer;
  const isUnder59Half = (client.age ?? 62) < 60;
  // blueTax sums Roth-side and AUM-side federal+state taxes across the entire
  // strategy. Split it into the actual conversion tax (from blueConversionTax,
  // which only includes federal+state on the conversion amount) vs. the rest
  // — tax on Social Security, non-SSI income, post-conversion RMDs, AUM
  // dividend/cap-gains drag, and state tax on all of it.
  const aumYearsLW = projection.aum_years ?? [];
  const aumPenaltyLW = aumYearsLW.reduce((s, y) => s + (y.earlyWithdrawalPenalty ?? 0), 0);
  const aumIncomeDragLW = Math.max(0, aumTotalTaxPaid - aumPenaltyLW);
  const otherStrategyTaxLW = Math.max(0, blueTax - blueConversionTax - aumIncomeDragLW);

  return (
    <>
      <p className="text-foreground font-medium">What is Lifetime Wealth?</p>
      <p>
        Lifetime Wealth is the net legacy your family receives — final account balances minus the taxes
        heirs would owe on inherited Traditional IRA. Both baseline and strategy use the same formula
        so the comparison is apples-to-apples.
      </p>

      <TipSection label="Your Starting Point">
        <TipRow label="Initial investment" value={toUSD(startingBalance)} />
        <TipRow
          label="Projection horizon"
          value={`age ${client.age} → ${client.end_age} (${projectionYears} yrs)`}
          variant="muted"
        />
        <TipRow label="Filing status" value={client.filing_status?.replace(/_/g, ' ')} variant="muted" />
        <TipRow
          label="Assumed growth rate"
          value={`${client.rate_of_return}% annually`}
          note={surrenderRateDiffers
            ? `${client.rate_of_return}% during the ${surrenderYears}-year surrender period, ${postContractRate}% afterward.`
            : undefined}
          variant="muted"
        />
      </TipSection>

      {/* How the strategy works — conditional sections describing every
          input that's driving the strategy column. */}
      <div className="bg-bg-card rounded-lg p-4 space-y-3">
        <p className="text-foreground font-medium text-xs uppercase tracking-wider">How the Strategy Works</p>

        {/* Conversion type */}
        <div className="space-y-1">
          <p className="text-xs text-foreground font-medium">
            Conversion strategy: {conversionType.replace(/_/g, ' ')}
          </p>
          <p className="text-xs text-text-muted">{conversionTypeDescription}</p>
        </div>

        {/* Years to defer conversion */}
        {yearsToDefer > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-foreground font-medium">
              Conversion deferred {yearsToDefer} {yearsToDefer === 1 ? 'year' : 'years'}
            </p>
            <p className="text-xs text-text-muted">
              Conversions don't start until age {conversionStartAge}. Lets the client coordinate with
              SS timing or wait for a low-bracket year.
            </p>
          </div>
        )}

        {/* Tax payment source */}
        <div className="space-y-1">
          <p className="text-xs text-foreground font-medium">
            Tax payment source: {taxPaymentSource === 'from_ira' ? 'paid from the IRA itself' : 'paid from outside funds'}
          </p>
          <p className="text-xs text-text-muted">
            {taxPaymentSource === 'from_ira' ? (
              <>
                Each year's conversion is grossed-down — the engine pulls enough extra from the IRA to
                cover the resulting tax. Total funded from the IRA for taxes: {toUSD(conversionTaxesFromIRA)}.
                {carrierCapOverflowActive && (
                  <> An additional {toUSD(conversionTaxesPaidExternally)} of conversion tax was assumed
                  to be paid from external funds across the projection — those years the carrier&apos;s
                  penalty-free withdrawal allowance was binding, so the IRA could only fund part of the
                  tax bill and the rest was modeled as coming from non-IRA cash.</>
                )}
                {isUnder59Half && (
                  <> Because the client is under 59½, the IRA-funded tax also incurs a 10% early-withdrawal
                  penalty ({toUSD(blueEarlyWithdrawalPenalty)} total). The externally-paid portion is not
                  subject to the penalty — it never left the IRA.</>
                )}
              </>
            ) : (
              <>The client writes the tax check from a taxable account or external cash, so the entire
              conversion lands in the Roth as principal. No early-withdrawal penalty applies.</>
            )}
          </p>
        </div>

        {/* IRMAA / penalty-free constraints */}
        {(constraintType === 'irmaa_threshold' || respectPenaltyFreeLimit) && (
          <div className="space-y-1">
            <p className="text-xs text-foreground font-medium">Per-year conversion caps</p>
            <p className="text-xs text-text-muted">
              {constraintType === 'irmaa_threshold' && (
                <>From age 63+, the engine caps each year's conversion so MAGI doesn't push into a higher
                IRMAA tier. </>
              )}
              {respectPenaltyFreeLimit && (
                <>During the {surrenderYears}-year surrender period, conversions are capped at {penaltyFreePercent}% of
                beginning-of-year IRA (carrier penalty-free withdrawal limit).</>
              )}
            </p>
          </div>
        )}

        {/* Voluntary withdrawals */}
        {hasVoluntaryWithdrawals && (
          <div className="space-y-1">
            <p className="text-xs text-foreground font-medium">Voluntary withdrawals scheduled</p>
            <p className="text-xs text-text-muted">
              Advisor-scheduled pulls on top of RMDs and conversions:&nbsp;
              {blueScheduledIraWithdrawals > 0 && <>{toUSD(blueScheduledIraWithdrawals)} from the IRA (taxable income)</>}
              {blueScheduledIraWithdrawals > 0 && (blueRothVoluntaryWithdrawals > 0 || blueAumScheduledWithdrawals > 0) && <> · </>}
              {blueRothVoluntaryWithdrawals > 0 && <>{toUSD(blueRothVoluntaryWithdrawals)} from the Roth (tax-free, qualified)</>}
              {blueRothVoluntaryWithdrawals > 0 && blueAumScheduledWithdrawals > 0 && <> · </>}
              {blueAumScheduledWithdrawals > 0 && (
                <>
                  {toUSD(blueAumScheduledWithdrawals)} from the AUM brokerage (the qualified-side request the
                  Roth-side IRA balance couldn&apos;t cover at this AUM allocation — taxed as a brokerage
                  liquidation, LTCG on the gain portion only, NO 10% early-withdrawal penalty even under 59½)
                </>
              )}
              .
              {isUnder59Half && blueScheduledIraWithdrawals > 0 && (
                <> 10% early-withdrawal penalty applies to the IRA portion since the client is under 59½.</>
              )}
              {isUnder59Half && blueAumScheduledWithdrawals > 0 && (
                <> The AUM brokerage portion does NOT incur the 10% penalty — the IRS treats a brokerage
                liquidation as a sale, not an early IRA distribution. If the client&apos;s intent was to take
                an under-59½ IRA pull (and accept the penalty), reduce the AUM allocation so the Roth-side
                IRA balance can satisfy more of the schedule.</>
              )}
            </p>
          </div>
        )}

        {/* AUM allocation */}
        {aumActive && (
          <div className="space-y-1">
            <p className="text-xs text-foreground font-medium">
              AUM split: {client.aum_allocation_percent}% to a managed brokerage account
            </p>
            <p className="text-xs text-text-muted">
              {toUSD(rothSidePortion)} stays for Roth conversion. {toUSD(aumStartingPortion)} pulls from
              the IRA over {client.aum_withdrawal_years} {client.aum_withdrawal_years === 1 ? 'year' : 'years'}
              {' '}— total IRA-to-AUM transfer (with growth while waiting): {toUSD(aumTotalWithdrawnFromIra)}.
              The brokerage charges {client.aum_fee_percent}%/yr in fees and incurs annual tax drag on
              dividends ({client.aum_dividend_yield}%/yr at LTCG) plus realized cap-gains turnover
              ({client.aum_turnover_percent}% at LTCG). Total tax + penalty paid on the AUM bucket:
              {' '}{toUSD(aumTotalTaxPaid)}. Final AUM balance: {toUSD(aumFinalBalance)} (taxable account,
              step-up in basis at death).
            </p>
          </div>
        )}

        {/* Anniversary bonus */}
        {hasAnniversaryBonus && (
          <div className="space-y-1">
            <p className="text-xs text-foreground font-medium">Anniversary bonus</p>
            <p className="text-xs text-text-muted">
              An additional {client.anniversary_bonus_percent}% bonus is applied at the end of years
              1–{client.anniversary_bonus_years} on top of the {client.bonus_percent}% upfront premium bonus.
            </p>
          </div>
        )}

        {/* Widow analysis */}
        {widowAnalysisActive && (
          <div className="space-y-1">
            <p className="text-xs text-foreground font-medium">Widow's penalty modeled</p>
            <p className="text-xs text-text-muted">
              {widowDeathAge != null
                ? <>First-death age set to {widowDeathAge}. </>
                : <>First death uses the heuristic default (older spouse + 85). </>}
              After that year the surviving spouse files single — narrower brackets and a smaller
              standard deduction make every baseline RMD dollar more expensive, which is part of why
              the strategy comes out ahead.
            </p>
          </div>
        )}

        {/* Other taxable income */}
        {hasNonSsiIncome && (
          <div className="space-y-1">
            <p className="text-xs text-foreground font-medium">Non-SSI income factored in</p>
            <p className="text-xs text-text-muted">
              The advisor-entered annual taxable income lines (pension, rental, wages, etc.) raise the
              client's bracket fill each year, leaving less room for low-rate Roth conversions.
            </p>
          </div>
        )}
      </div>

      <TipSection label="Baseline · Keep Traditional IRA">
        <p className="text-xs text-text-dim leading-relaxed mb-2">
          Your {toUSD(startingBalance)} stays in a Traditional IRA, growing at {client.rate_of_return}% with RMDs starting at 73.
        </p>
        <TipRow label="Final Traditional IRA" value={toUSD(baseFinalTraditional)} />
        <TipRow label="Final Roth IRA" value={toUSD(baseFinalRoth)} />
        <TipRow label="Final taxable account" value={toUSD(Math.max(0, projection.baseline_final_taxable))} />
        <TipDivider />
        <TipRow label="Gross estate" value={toUSD(projection.baseline_final_net_worth)} />
        <TipRow label={`− Heir tax on Traditional (${heirTaxPct}%)`} value={toUSD(baseHeirTax)} variant="negative" />
        <TipRow label="Net legacy to heirs" value={toUSD(baseNetLegacy)} variant="subtotal" />
        <TipDivider />
        <TipRow label="Baseline lifetime wealth" value={toUSD(baseLifetimeWealth)} variant="subtotal" />
        <TipNote>
          Over {projectionYears} years, you'd take {toUSD(baseRMDs)} in RMDs and pay {toUSD(baseRMDTaxOnly)} in marginal income tax attributable to them. Total lifetime fed+state across the baseline ({toUSD(baseTax)}) also includes background tax on Social Security and other income.
        </TipNote>
      </TipSection>

      <TipSection
        label={`Strategy · ${aumActive ? 'Roth Conversion + AUM Split' : 'Roth Conversions'}`}
        variant="gold"
      >
        <p className="text-xs text-text-dim leading-relaxed mb-2">
          Your {toUSD(startingBalance)} + {client.bonus_percent}% premium bonus ({toUSD(bonusAmount)}) ={' '}
          {toUSD(startingWithBonus)} starting balance
          {hasAnniversaryBonus && <>, plus {client.anniversary_bonus_percent}% anniversary bonus at end of years 1–{client.anniversary_bonus_years}</>}
          {aumActive
            ? <>. Roth-conversion side runs on {toUSD(rothSidePortion)} ({100 - (client.aum_allocation_percent ?? 0)}%); the remaining {toUSD(aumStartingPortion)} ({client.aum_allocation_percent}%) is pulled from the IRA into a managed brokerage account.</>
            : <>, converted to Roth over time.</>}
        </p>
        <TipRow label="Total converted to Roth" value={toUSD(blueConversions)} />
        <TipRow label="Tax paid on conversions" value={toUSD(blueConversionTax)} variant="negative" />
        {otherStrategyTaxLW > 0 && (
          <TipRow
            label="Other strategy taxes (SS, RMDs, ordinary, state)"
            value={toUSD(otherStrategyTaxLW)}
            variant="negative"
          />
        )}
        {aumActive && aumIncomeDragLW > 0 && (
          <TipRow label="AUM income + cap-gains drag tax" value={toUSD(aumIncomeDragLW)} variant="negative" />
        )}
        {taxPaymentSource === 'from_ira' && conversionTaxesFromIRA > 0 && (
          <TipNote>
            {toUSD(conversionTaxesFromIRA)} of conversion tax was pulled from the IRA itself.
            {carrierCapOverflowActive && (
              <> An additional {toUSD(conversionTaxesPaidExternally)} was funded from external (non-IRA)
              cash because the carrier&apos;s penalty-free withdrawal allowance capped how much could
              come out of the contract.</>
            )}
          </TipNote>
        )}
        {blueEarlyWithdrawalPenalty > 0 && (
          <TipRow
            label="10% early-withdrawal penalty (under 59½)"
            value={toUSD(blueEarlyWithdrawalPenalty)}
            note={aumActive && aumPenaltyLW > 0 ? <>{toUSD(aumPenaltyLW)} of this came from the AUM transfers.</> : undefined}
            variant="negative"
          />
        )}

        {aumActive && (
          <>
            <TipDivider />
            <p className="text-[11px] uppercase tracking-[1.5px] text-foreground font-medium pt-1">AUM Bucket Detail</p>
            <TipRow
              label="Total IRA-to-AUM transfer"
              value={toUSD(aumTotalWithdrawnFromIra)}
              note={<>{toUSD(aumStartingPortion)} starting portion + tax-deferred growth while waiting.</>}
            />
            <TipRow
              label="Final AUM balance"
              value={toUSD(aumFinalBalance)}
              note="Sits in the brokerage; heirs get step-up in basis at death."
              variant="positive"
            />
          </>
        )}

        <TipDivider />
        <TipRow label="Final Traditional IRA" value={toUSD(blueFinalTraditional)} />
        <TipRow label="Final Roth IRA" value={toUSD(blueFinalRoth)} variant="positive" />
        <TipRow
          label="Final taxable account"
          value={toUSD(Math.max(0, projection.blueprint_final_taxable))}
          note={aumActive ? <>Includes the {toUSD(aumFinalBalance)} AUM bucket.</> : undefined}
        />
        <TipDivider />
        <TipRow label="Gross estate" value={toUSD(projection.blueprint_final_net_worth)} />
        <TipRow label={`− Heir tax on Traditional (${heirTaxPct}%)`} value={toUSD(blueHeirTax)} variant="negative" />
        <TipDivider />
        <TipRow label="Strategy lifetime wealth" value={toUSD(blueLifetimeWealth)} variant="total" />
        <TipNote>
          No RMDs required from Roth. Your heirs inherit {toUSD(blueFinalRoth)} completely tax-free
          {aumActive && <> plus {toUSD(aumFinalBalance)} from the AUM bucket (step-up in basis erases unrealized cap gains)</>}.
        </TipNote>
      </TipSection>

      {/* The Difference */}
      <div className={cn(
        'rounded-xl p-5',
        wealthDiff > 0 ? 'bg-green-bg border border-green/30' : 'bg-red-bg border border-red/30',
      )}>
        <div className="flex items-baseline justify-between gap-4 mb-3">
          <p className={cn('text-[11px] font-semibold uppercase tracking-[1.5px]', wealthDiff > 0 ? 'text-green' : 'text-red')}>
            The Bottom Line
          </p>
          <p className={cn('text-base font-mono tabular-nums font-semibold', wealthDiff > 0 ? 'text-green' : 'text-red')}>
            {wealthDiff > 0 ? '+' : ''}{toUSD(wealthDiff)}
          </p>
        </div>
        <p className="text-sm text-foreground/85 leading-relaxed">
          {wealthDiff > 0 ? (
            <>The Roth conversion strategy creates <strong className="text-foreground">{toUSD(wealthDiff)} more</strong> in total family wealth. This comes from:</>
          ) : (
            <>The baseline scenario results in {toUSD(Math.abs(wealthDiff))} more lifetime wealth in this case.</>
          )}
        </p>
        {wealthDiff > 0 && (
          <ul className="list-disc pl-5 space-y-1.5 mt-3 text-sm text-foreground/85 leading-relaxed">
            <li><strong className="text-foreground">{client.bonus_percent}% premium bonus</strong> adding {toUSD(bonusAmount)} upfront{hasAnniversaryBonus && <> + <strong className="text-foreground">{client.anniversary_bonus_percent}% anniversary bonus</strong> for {client.anniversary_bonus_years} years</>}</li>
            <li><strong className="text-foreground">Tax-free Roth growth</strong> at {client.rate_of_return}% for {projectionYears} years</li>
            <li><strong className="text-foreground">No heir taxes</strong> on {toUSD(blueFinalRoth)} Roth balance (vs {heirTaxPct}% on Traditional)</li>
            <li><strong className="text-foreground">No forced RMDs</strong> keeping money invested longer</li>
            {widowAnalysisActive && (
              <li><strong className="text-foreground">Widow's penalty avoided</strong> — surviving spouse doesn't get hit with single-bracket RMDs on a still-large Traditional IRA</li>
            )}
            {aumActive && (
              <li><strong className="text-foreground">AUM bucket adds {toUSD(aumFinalBalance)}</strong> in liquid taxable wealth with step-up at death — but pure Roth would beat the split since AUM has fees + annual tax drag and pays withdrawal tax upfront at the marginal rate. The split is a liquidity/diversification choice, not a wealth-maximizing one.</li>
            )}
          </ul>
        )}
        {wealthDiff <= 0 && aumActive && (
          <p className="mt-2 text-sm text-text-dim">
            The AUM portion has annual fees + tax drag and pays withdrawal tax upfront at the marginal
            rate, which can outweigh the Roth-conversion benefit on a raw wealth basis. The split is
            usually justified by liquidity, diversification, or the client's preference for taxable
            funds — not by wealth maximization.
          </p>
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
  aumActive,
  aumFinalBalance,
  widowAnalysisActive,
  widowDeathAge,
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
  aumActive: boolean;
  aumFinalBalance: number;
  widowAnalysisActive: boolean;
  widowDeathAge: number | null;
}) {
  const heirTaxPct = Math.round(heirTaxRate * 100);
  // The "non-AUM" portion of the strategy's taxable balance — i.e. the
  // client's original taxable account plus any RMD/conversion-tax flows.
  const blueNonAumTaxable = aumActive
    ? Math.max(0, blueFinalTaxable - aumFinalBalance)
    : Math.max(0, blueFinalTaxable);

  return (
    <>
      <p className="text-foreground font-medium">What is Legacy to Heirs?</p>
      <p>
        This is the net amount your beneficiaries actually receive after paying any taxes owed on inherited accounts.
        Roth IRAs pass tax-free, Traditional IRAs are taxed as income to your heirs, and taxable
        brokerage accounts get a step-up in basis at death (heirs owe no tax on unrealized gains).
      </p>

      <TipSection label="Baseline Inheritance">
        <TipRow label="Traditional IRA balance" value={toUSD(baseFinalTraditional)} />
        <TipRow label={`− Heir's income tax (${heirTaxPct}%)`} value={toUSD(baseHeirTax)} variant="negative" />
        <TipRow label="+ Roth IRA (tax-free)" value={toUSD(baseFinalRoth)} variant="positive" />
        <TipRow label="+ Taxable account (step-up)" value={toUSD(Math.max(0, baseFinalTaxable))} />
        <TipDivider />
        <TipRow label="Net legacy" value={toUSD(baseNetLegacy)} variant="subtotal" />
      </TipSection>

      <TipSection label="Strategy Inheritance" variant="gold">
        <TipRow label="Traditional IRA balance" value={toUSD(blueFinalTraditional)} />
        <TipRow label={`− Heir's income tax (${heirTaxPct}%)`} value={toUSD(blueHeirTax)} variant="negative" />
        <TipRow label="+ Roth IRA (tax-free)" value={toUSD(blueFinalRoth)} variant="positive" />
        {aumActive ? (
          <>
            <TipRow label="+ Original taxable account (step-up)" value={toUSD(blueNonAumTaxable)} />
            <TipRow label="+ AUM brokerage (step-up)" value={toUSD(aumFinalBalance)} />
          </>
        ) : (
          <TipRow label="+ Taxable account (step-up)" value={toUSD(Math.max(0, blueFinalTaxable))} />
        )}
        <TipDivider />
        <TipRow label="Net legacy" value={toUSD(blueNetLegacy)} variant="total" />
        {aumActive && (
          <TipNote>
            Step-up in basis at death means heirs inherit the AUM brokerage at its fair market value —
            none of the unrealized capital gains accumulated during life are taxed to them.
          </TipNote>
        )}
      </TipSection>

      <p className="text-xs text-text-dim leading-relaxed">
        Note: We assume your heirs will be in the {heirTaxPct}% tax bracket when they inherit.
        Under current law, non-spouse beneficiaries must withdraw inherited IRAs within 10 years
        (the SECURE Act's "10-year rule"), which is why concentrating wealth in a Traditional IRA
        creates a heavier tax bill for them than spreading it across Roth + taxable.
      </p>
      {widowAnalysisActive && (
        <p className="text-xs text-text-dim leading-relaxed">
          Widow's penalty modeled: {widowDeathAge != null
            ? <>first death at age {widowDeathAge}.</>
            : <>using the heuristic default for first-death age.</>}
          {' '}After first death, the surviving spouse files single — so any remaining Traditional IRA
          distributions land in narrower brackets, increasing the lifetime tax cost on the baseline side.
          That's part of why the strategy's net legacy beats baseline.
        </p>
      )}
    </>
  );
}

function TotalTaxesInfo({
  client,
  baseTax,
  baseRMDTaxOnly,
  baseIrmaa,
  baseHeirTax,
  baseTotalTaxes,
  blueTax,
  blueConversionTax,
  blueRMDTaxOnly,
  blueIrmaa,
  blueHeirTax,
  blueTotalTaxes,
  blueConversions,
  heirTaxRate,
  aumActive,
  aumTotalTaxPaid,
  aumEarlyWithdrawalPenalty,
  conversionType,
  taxPaymentSource,
  conversionTaxesFromIRA,
  conversionTaxesPaidExternally,
  carrierCapOverflowActive,
  blueEarlyWithdrawalPenalty,
  constraintType,
  widowAnalysisActive,
  widowDeathAge,
}: {
  client: Client;
  baseTax: number;
  baseRMDTaxOnly: number;
  baseIrmaa: number;
  baseHeirTax: number;
  baseTotalTaxes: number;
  blueTax: number;
  blueConversionTax: number;
  blueRMDTaxOnly: number;
  blueIrmaa: number;
  blueHeirTax: number;
  blueTotalTaxes: number;
  blueConversions: number;
  heirTaxRate: number;
  aumActive: boolean;
  aumTotalTaxPaid: number;
  aumEarlyWithdrawalPenalty: number;
  conversionType: string;
  taxPaymentSource: string;
  conversionTaxesFromIRA: number;
  conversionTaxesPaidExternally: number;
  carrierCapOverflowActive: boolean;
  blueEarlyWithdrawalPenalty: number;
  constraintType: string;
  widowAnalysisActive: boolean;
  widowDeathAge: number | null;
}) {
  const heirTaxPct = Math.round(heirTaxRate * 100);
  // Split each side's total fed+state into honest, labeled buckets so the row
  // labels match the values. Both sides use the SAME bucket structure so the
  // tooltip reads as a true apples-to-apples comparison.
  //
  // Baseline:
  //   1. Income tax on RMDs (marginal) — tax dollars caused by the RMDs,
  //      isolated via computeMarginalRMDTax.
  //   2. Other baseline income tax — everything else fed+state in the
  //      baseline (tax on Social Security, non-SSI income, etc.).
  //
  // Strategy:
  //   1. Income tax on conversions — federalTaxOnConversions + stateTaxOnConversions.
  //   2. Income tax on remaining RMDs (when partial/optimized leaves some) —
  //      via computeMarginalRMDTax on the strategy years.
  //   3. AUM withdrawal + tax drag — only when AUM is active; excludes the
  //      10% penalty (its own row).
  //   4. Other strategy income tax — everything else fed+state taxed in the
  //      strategy (Social Security tax, non-SSI ordinary income, etc.).
  const otherBaselineTax = Math.max(0, baseTax - baseRMDTaxOnly);
  const aumIncomeAndDragTax = aumActive ? Math.max(0, aumTotalTaxPaid - aumEarlyWithdrawalPenalty) : 0;
  const otherStrategyTax = Math.max(0, blueTax - blueConversionTax - blueRMDTaxOnly - aumIncomeAndDragTax);
  const taxSavings = baseTotalTaxes - blueTotalTaxes;

  return (
    <>
      <p className="text-foreground font-medium">What are Total Taxes Paid?</p>
      <p>
        This includes every tax line that touches the client AND their heirs across the projection —
        income tax on RMDs, conversions, and any voluntary withdrawals; the 10% early-withdrawal
        penalty when applicable; Medicare IRMAA surcharges; AUM ordinary-income tax on transfers and
        ongoing tax drag (dividends, realized cap gains); and the heir's income tax on any remaining
        Traditional IRA balance.
      </p>

      <TipSection label="Baseline Taxes">
        <TipRow
          label="Income tax on RMDs (marginal)"
          value={toUSD(baseRMDTaxOnly)}
          note="Tax dollars caused by the RMDs themselves, isolated from background income tax. Same number the PDF shows on the Distributions summary."
          variant="negative"
        />
        {otherBaselineTax > 0 && (
          <TipRow
            label="Other baseline income tax"
            value={toUSD(otherBaselineTax)}
            note="Federal + state tax on Social Security, non-SSI ordinary income, and any other taxable income the client owes regardless of the strategy."
            variant="negative"
          />
        )}
        <TipRow label="Medicare IRMAA surcharges" value={toUSD(baseIrmaa)} variant="negative" />
        <TipRow label={`Heir's tax on inheritance (${heirTaxPct}%)`} value={toUSD(baseHeirTax)} variant="negative" />
        <TipDivider />
        <TipRow label="Total taxes" value={toUSD(baseTotalTaxes)} variant="subtotal" />
        {widowAnalysisActive && (
          <TipNote>
            Widow's penalty modeled: from {widowDeathAge != null ? `age ${widowDeathAge}` : 'the heuristic first-death age'}{' '}
            onward, the surviving spouse files single — same RMDs but at narrower brackets, so baseline tax climbs.
          </TipNote>
        )}
      </TipSection>

      <TipSection label="Strategy Taxes" variant="gold">
        {conversionType !== 'no_conversion' && (
          <TipRow
            label="Income tax on conversions"
            value={toUSD(blueConversionTax)}
            note={
              <>
                Converted {toUSD(blueConversions)} via {conversionType.replace(/_/g, ' ')}
                {conversionType === 'optimized_amount' && <>, staying in the {client.max_tax_rate}% bracket</>}.
                {taxPaymentSource === 'from_ira' && conversionTaxesFromIRA > 0 && (
                  <> {toUSD(conversionTaxesFromIRA)} of that tax was pulled from the IRA itself (gross-down).</>
                )}
                {carrierCapOverflowActive && (
                  <> {toUSD(conversionTaxesPaidExternally)} of conversion tax was funded externally because
                  the carrier&apos;s penalty-free withdrawal allowance capped what could be distributed out
                  of the contract during the surrender period.</>
                )}
              </>
            }
            variant="negative"
          />
        )}
        {blueRMDTaxOnly > 0 && (
          <TipRow
            label="Income tax on remaining RMDs"
            value={toUSD(blueRMDTaxOnly)}
            note="Marginal tax on RMDs that still occur in the strategy when the conversion plan doesn't fully drain the Traditional IRA before age 73 (partial / optimized / fixed conversion types). Zero when the strategy fully converts before RMDs begin."
            variant="negative"
          />
        )}
        {otherStrategyTax > 0 && (
          <TipRow
            label="Other strategy income tax"
            value={toUSD(otherStrategyTax)}
            note="Federal + state tax on Social Security, non-SSI ordinary income, and any other taxable income the client owes regardless of the strategy. Background tax that's the same on both sides."
            variant="negative"
          />
        )}
        {aumActive && (
          <TipRow
            label="AUM withdrawal + tax drag"
            value={toUSD(aumIncomeAndDragTax)}
            note="Ordinary-income tax on the IRA-to-AUM transfer + annual dividend tax + realized cap-gains turnover tax."
            variant="negative"
          />
        )}
        {blueEarlyWithdrawalPenalty > 0 && (
          <TipRow
            label="10% early-withdrawal penalty (under 59½)"
            value={toUSD(blueEarlyWithdrawalPenalty)}
            note={
              aumActive && aumEarlyWithdrawalPenalty > 0
                ? <>{toUSD(aumEarlyWithdrawalPenalty)} of this came from the AUM transfers.</>
                : undefined
            }
            variant="negative"
          />
        )}
        <TipRow
          label="Medicare IRMAA surcharges"
          value={toUSD(blueIrmaa)}
          note={
            constraintType === 'irmaa_threshold'
              ? "IRMAA constraint is on — each year's conversion is sized so MAGI doesn't push into a higher Medicare premium tier from age 63+."
              : undefined
          }
          variant="negative"
        />
        <TipRow
          label={`Heir's tax on remaining Traditional (${heirTaxPct}%)`}
          value={toUSD(blueHeirTax)}
          variant="negative"
        />
        <TipDivider />
        <TipRow label="Total taxes" value={toUSD(blueTotalTaxes)} variant="total" />
        {aumActive && (
          <TipNote>
            AUM bucket pays ordinary-income tax up front on the IRA-to-AUM transfer (no bracket optimization — flat marginal rate),
            then ongoing tax drag every year on dividends and realized cap-gains turnover.
          </TipNote>
        )}
      </TipSection>

      <div className={cn(
        'rounded-xl p-5',
        taxSavings > 0 ? 'bg-green-bg border border-green/30' : 'bg-red-bg border border-red/30',
      )}>
        <div className="flex items-baseline justify-between gap-4 mb-2">
          <p className={cn('text-[11px] font-semibold uppercase tracking-[1.5px]', taxSavings > 0 ? 'text-green' : 'text-red')}>
            {taxSavings > 0 ? 'Tax Savings' : 'Additional Taxes'}
          </p>
          <p className={cn('text-base font-mono tabular-nums font-semibold', taxSavings > 0 ? 'text-green' : 'text-red')}>
            {taxSavings > 0 ? '−' : '+'}{toUSD(Math.abs(taxSavings))}
          </p>
        </div>
        <p className="text-sm text-foreground/85 leading-relaxed">
          {taxSavings > 0 ? (
            <>The strategy saves {toUSD(taxSavings)} in total taxes because the client converts at a
            {' '}{client.max_tax_rate}% rate now instead of heirs paying {heirTaxPct}% later. Lower
            taxes = more wealth for the family.</>
          ) : (
            <>The strategy results in {toUSD(Math.abs(taxSavings))} more in taxes
            {aumActive && <> (mostly from AUM withdrawal tax + ongoing drag — that's the cost of routing money to the brokerage instead of keeping it in tax-deferred / tax-free wrappers)</>},
            potentially offset by greater tax-free growth in the Roth account and more flexibility.</>
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
  aumActive,
  aumTotalWithdrawnFromIra,
  aumStartingPortion,
  hasVoluntaryWithdrawals,
  blueScheduledIraWithdrawals,
  blueRothVoluntaryWithdrawals,
  blueAumScheduledWithdrawals,
  yearsToDefer,
}: {
  client: Client;
  baseRMDs: number;
  baseCumulativeDistributions: number;
  rmdTreatment: string;
  aumActive: boolean;
  aumTotalWithdrawnFromIra: number;
  aumStartingPortion: number;
  hasVoluntaryWithdrawals: boolean;
  blueScheduledIraWithdrawals: number;
  blueRothVoluntaryWithdrawals: number;
  blueAumScheduledWithdrawals: number;
  yearsToDefer: number;
}) {
  return (
    <>
      <p className="text-foreground font-medium">What are Forced Distributions?</p>
      <p>
        Required Minimum Distributions (RMDs) the IRS forces the client to take from a Traditional IRA
        starting at age 73 — and the income tax owed on them. The strategy shows $0 here because Roth
        IRAs have no RMDs. Voluntary withdrawals and AUM transfers DO happen in the strategy, but
        they're elective (advisor-scheduled), not forced — they're surfaced separately below.
      </p>

      {rmdTreatment === 'spent' ? (
        <>
          <TipSection label="Baseline Forced Distributions">
            <TipRow label="Gross RMDs taken" value={toUSD(baseRMDs)} />
            <TipRow label="After taxes (what reaches the client)" value={toUSD(baseCumulativeDistributions)} variant="subtotal" />
            <TipNote>
              "Spent on Living Expenses" RMD treatment is selected — those after-tax dollars leave the
              simulation rather than being reinvested in a taxable account.
            </TipNote>
          </TipSection>
        </>
      ) : (
        <>
          <TipSection label="Baseline Forced Distributions">
            <TipRow label="Total gross RMDs" value={toUSD(baseRMDs)} variant="subtotal" />
            <TipNote>
              Taxed as ordinary income each year. The {rmdTreatment === 'reinvested' ? 'reinvested' : 'cash'} treatment
              keeps the after-tax remainder in the {rmdTreatment === 'reinvested' ? 'taxable account where it earns interest' : 'cash bucket without earning interest'}.
            </TipNote>
          </TipSection>
        </>
      )}

      <TipSection label="Strategy · No Forced Roth Distributions" variant="gold">
        <p className="text-sm text-foreground/85 leading-relaxed mb-3">
          The Roth IRA has <strong className="text-foreground">no Required Minimum Distributions</strong>. Whatever's in
          the Roth stays invested and growing tax-free for as long as the client (and their heirs) want.
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-foreground/85 leading-relaxed mb-3">
          <li>No forced taxable income that could push the client into higher brackets</li>
          <li>More control over retirement income timing</li>
          <li>Tax-free legacy to heirs</li>
        </ul>

        {(hasVoluntaryWithdrawals || aumActive) && (
          <>
            <TipDivider />
            <p className="text-[11px] uppercase tracking-[1.5px] text-gold font-semibold pt-2 pb-1">
              Distributions that DO happen in the strategy
            </p>
            {hasVoluntaryWithdrawals && (
              <>
                {blueScheduledIraWithdrawals > 0 && (
                  <TipRow
                    label="Voluntary IRA pulls (taxable income)"
                    value={toUSD(blueScheduledIraWithdrawals)}
                  />
                )}
                {blueRothVoluntaryWithdrawals > 0 && (
                  <TipRow
                    label="Voluntary Roth pulls (tax-free)"
                    value={toUSD(blueRothVoluntaryWithdrawals)}
                    variant="positive"
                  />
                )}
                {blueAumScheduledWithdrawals > 0 && (
                  <TipRow
                    label="Voluntary AUM brokerage pulls (LTCG on gain)"
                    value={toUSD(blueAumScheduledWithdrawals)}
                  />
                )}
                <TipNote>
                  These are pulls the advisor entered on the withdrawal schedule — separate from RMDs and conversions,
                  reducing the buckets year-by-year.
                  {blueAumScheduledWithdrawals > 0 && (
                    <> The AUM brokerage line is the IRA-side request the Roth-side IRA balance couldn&apos;t satisfy
                    at this allocation split — taxed as a brokerage liquidation rather than ordinary income, and
                    not subject to the 10% early-withdrawal penalty even under 59½ (the qualified tax was already
                    paid on the IRA→AUM transfer).</>
                  )}
                </TipNote>
              </>
            )}
            {aumActive && (
              <TipRow
                label={`IRA-to-AUM transfer (over ${client.aum_withdrawal_years} ${client.aum_withdrawal_years === 1 ? 'year' : 'years'})`}
                value={toUSD(aumTotalWithdrawnFromIra)}
                note={
                  <>
                    The {client.aum_allocation_percent}% AUM slice. Engine pulls pendingIRA / yearsRemaining each year
                    to spread the tax burden evenly. Total exceeds the {toUSD(aumStartingPortion)} starting portion
                    because the IRA grows tax-deferred while waiting.
                  </>
                }
              />
            )}
          </>
        )}

        {yearsToDefer > 0 && (
          <TipNote>
            Conversion is deferred {yearsToDefer} {yearsToDefer === 1 ? 'year' : 'years'} —
            distribution patterns shift accordingly. Conversions don't begin until age {(client.age ?? 62) + yearsToDefer}.
          </TipNote>
        )}
      </TipSection>
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

// Comparison view now uses ResizableComparisonTable with the shared
// column-selector infrastructure — see usage above. The previous hardcoded
// 7-column ComparisonTable was removed because it (a) ignored the user's
// column selection, (b) computed diff against incomplete totals (missed
// taxableBalance on both sides — the same Math.max(0, …)-class bug we fixed
// elsewhere), and (c) used hardcoded dark colors that broke in Light mode.
