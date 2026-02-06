"use client";

import { useRef } from "react";
import { useProjection } from "@/lib/queries/projections";
import { WealthChart } from "@/components/results/wealth-chart";
import { transformToGIChartData } from "@/lib/calculations/transforms";
import { ALL_PRODUCTS, type FormulaType } from "@/lib/config/products";
import type { Client } from "@/lib/types/client";
import type { YearlyResult } from "@/lib/calculations";
import { ArrowLeft, Pencil, Check } from "lucide-react";
import { useAnnotation } from "@/hooks/use-annotation";
import { AnnotationCanvas } from "@/components/report/annotation-canvas";
import { cn } from "@/lib/utils";

interface GIPresentationModeProps {
  client: Client;
  onExit: () => void;
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

export function GIPresentationMode({ client, onExit }: GIPresentationModeProps) {
  const { data: projectionResponse, isLoading } = useProjection(client.id);
  const contentRef = useRef<HTMLDivElement>(null);
  const annotation = useAnnotation();

  if (isLoading || !projectionResponse?.projection) {
    return (
      <div className="fixed inset-0 bg-[#0c0c0c] z-50 flex items-center justify-center">
        <div className="text-[rgba(255,255,255,0.5)]">Loading presentation...</div>
      </div>
    );
  }

  const { projection } = projectionResponse;
  const chartData = transformToGIChartData(projection);
  const heirTaxRate = (client.heir_tax_rate ?? 40) / 100;

  // Calculate break-even from chart data (lifetime wealth trajectory, not raw netWorth)
  const chartBreakEvenAge = chartData.find(d => d.formula > d.baseline)?.age ?? null;

  // GI-specific calculations
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
  const baseLifetimeWealth = baseNetLegacy;

  // Formula (GI) calculations
  let blueConversionTax = 0;
  projection.blueprint_years.forEach((year, i) => {
    const giYear = giYearlyData[i];
    if (giYear && giYear.phase === "deferral") {
      blueConversionTax += (year.federalTax + year.stateTax) || 0;
    }
  });

  const blueIrmaa = sum(projection.blueprint_years, "irmaaSurcharge");
  const blueFinalTraditional = projection.blueprint_final_traditional;
  const blueFinalRoth = projection.blueprint_final_roth;
  const giTotalGross = projection.gi_total_gross_paid ?? 0;
  const giTotalNet = projection.gi_total_net_paid ?? 0;
  // Heir tax only applies to remaining traditional (annuity account value)
  const blueHeirTax = Math.round(blueFinalTraditional * heirTaxRate);
  // Net legacy = final net worth (includes taxable where GI payments accumulate) minus heir taxes
  const blueNetLegacy = projection.blueprint_final_net_worth - blueHeirTax;
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

  const payoutTypeDisplay = client.payout_type === "joint" ? "Joint Life" : "Single Life";

  // Format filing status
  const formatFilingStatus = (status: string): string => {
    const map: Record<string, string> = {
      single: "Single",
      married_filing_jointly: "Married Filing Jointly",
      married_filing_separately: "MFS",
      head_of_household: "HOH",
    };
    return map[status] || status;
  };

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!annotation.isActive) return;
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return;
    annotation.startDrawing({ x: e.clientX - rect.left, y: e.clientY - rect.top + (contentRef.current?.scrollTop || 0) });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!annotation.isActive) return;
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return;
    annotation.continueDrawing({ x: e.clientX - rect.left, y: e.clientY - rect.top + (contentRef.current?.scrollTop || 0) });
  };

  const handleMouseUp = () => {
    if (!annotation.isActive) return;
    annotation.endDrawing();
  };

  return (
    <div
      ref={contentRef}
      className="fixed inset-0 bg-[#0c0c0c] z-50 overflow-y-auto text-white relative"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Annotation Canvas */}
      {annotation.isActive && (
        <AnnotationCanvas
          isActive={annotation.isActive}
          activeTool={annotation.activeTool}
          annotations={annotation.annotations}
          currentAnnotation={annotation.currentAnnotation}
          drawTick={annotation.drawTick}
          onMouseDown={annotation.startDrawing}
          onMouseMove={annotation.continueDrawing}
          onMouseUp={annotation.endDrawing}
          onTextPlace={annotation.addTextAnnotation}
          contentRef={contentRef}
        />
      )}

      {/* Sticky Toolbar */}
      <div className="sticky top-0 z-50 px-8 py-3 flex justify-between items-center bg-[rgba(12,12,12,0.95)] backdrop-blur-xl border-b border-[rgba(255,255,255,0.07)]">
        <div className="flex items-center gap-4">
          <button
            onClick={onExit}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-[rgba(255,255,255,0.5)] border border-[rgba(255,255,255,0.07)] rounded-[10px] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Exit
          </button>
          <span className="text-sm text-[rgba(255,255,255,0.4)]">
            Presenting: {client.name}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              annotation.toggleAnnotationMode();
              if (annotation.isActive) {
                annotation.clearAll();
              }
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm rounded-[10px] transition-colors ${
              annotation.isActive
                ? "text-gold border border-gold bg-[rgba(212,175,55,0.08)]"
                : "text-[rgba(255,255,255,0.5)] border border-[rgba(255,255,255,0.07)] hover:bg-[rgba(255,255,255,0.04)]"
            }`}
          >
            <Pencil className="h-4 w-4" />
            {annotation.isActive ? "Stop Drawing" : "Annotate"}
          </button>
          {annotation.isActive && annotation.annotations.length > 0 && (
            <button
              onClick={annotation.clearAll}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-[rgba(255,255,255,0.5)] border border-[rgba(255,255,255,0.07)] rounded-[10px] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Presentation Content */}
      <div className="max-w-[1000px] mx-auto px-10 py-12">
        {/* 1. Title Block */}
        <div className="text-center mb-14">
          <div className="w-[60px] h-[3px] bg-gold rounded mx-auto mb-6" />
          <p className="text-sm uppercase tracking-[3px] text-[rgba(255,255,255,0.4)] mb-3">
            Guaranteed Income Analysis
          </p>
          <h1 className="font-display text-[44px] font-normal mb-3">{client.name}</h1>
          <p className="text-base text-[rgba(255,255,255,0.5)]">
            Age {client.age}
            {client.spouse_name && ` & ${client.spouse_name}, ${client.spouse_age}`} ·{" "}
            {formatFilingStatus(client.filing_status)} ·{" "}
            ${(client.qualified_account_value / 100000000).toFixed(1)}M
          </p>
        </div>

        {/* 2. The Guarantee Hero */}
        <div className="bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.2)] rounded-[16px] py-12 px-14 text-center mb-12">
          <p className="text-sm uppercase tracking-[3px] text-[rgba(212,175,55,0.7)] mb-2 font-medium">
            Your Guaranteed Lifetime Income
          </p>
          <div className="w-16 h-[2px] bg-gold mx-auto mb-6" />
          <p className="text-[56px] font-mono font-semibold text-gold mb-1">
            {toUSD(projection.gi_annual_income_gross || 0)}/year
          </p>
          <p className="text-xl font-display text-white mb-5">for life</p>
          <p className="text-lg text-[rgba(255,255,255,0.6)]">
            After taxes: {toUSD(projection.gi_annual_income_net || 0)}/year · Starting age {incomeStartAge}
          </p>
          <p className="text-base text-[rgba(255,255,255,0.4)] mt-1">
            {payoutTypeDisplay} · {payoutPercent.toFixed(2)}% payout rate
          </p>
        </div>

        {/* 3. Income Base Journey */}
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-8 mb-12">
          <p className="text-xs uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] mb-6 font-medium">
            How Your Income Is Calculated
          </p>

          <div className="flex items-center justify-between gap-3 mb-6 overflow-x-auto pb-2">
            <div className="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-[10px] py-4 px-5 text-center min-w-[120px]">
              <p className="text-xl font-mono font-medium text-white">{toUSD(deposit)}</p>
              <p className="text-sm text-[rgba(255,255,255,0.5)] mt-1">Deposit</p>
            </div>
            <span className="text-xl text-[rgba(255,255,255,0.3)]">→</span>
            <div className="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-[10px] py-4 px-5 text-center min-w-[120px]">
              <p className="text-xl font-mono font-medium text-gold">+{toUSD(bonusAmount)}</p>
              <p className="text-sm text-[rgba(255,255,255,0.5)] mt-1">{bonusPercent}% Bonus</p>
            </div>
            <span className="text-xl text-[rgba(255,255,255,0.3)]">→</span>
            <div className="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-[10px] py-4 px-5 text-center min-w-[120px]">
              <p className="text-xl font-mono font-medium text-white">{toUSD(startingIncomeBase)}</p>
              <p className="text-sm text-[rgba(255,255,255,0.5)] mt-1">Starting Base</p>
            </div>
            <span className="text-xl text-[rgba(255,255,255,0.3)]">→</span>
            <div className="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-[10px] py-4 px-5 text-center min-w-[120px]">
              <p className="text-xl font-mono font-medium text-gold">+{toUSD(rollUpGrowth)}</p>
              <p className="text-sm text-[rgba(255,255,255,0.5)] mt-1">Roll-Up</p>
            </div>
            <span className="text-xl text-[rgba(255,255,255,0.3)]">→</span>
            <div className="bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.2)] rounded-[10px] py-4 px-5 text-center min-w-[120px]">
              <p className="text-xl font-mono font-semibold text-gold">{toUSD(finalIncomeBase)}</p>
              <p className="text-sm text-[rgba(212,175,55,0.7)] mt-1">Final Base</p>
            </div>
          </div>

          <div className="pt-5 border-t border-[rgba(255,255,255,0.07)]">
            <p className="text-base font-mono text-[rgba(255,255,255,0.6)]">
              {toUSD(finalIncomeBase)} × {payoutPercent.toFixed(2)}% = <span className="text-gold font-semibold">{toUSD(calculatedIncome)}/year guaranteed</span>
            </p>
          </div>
        </div>

        {/* 4. Key Metrics (3-column grid) */}
        <div className="grid grid-cols-3 gap-6 mb-12">
          <div className="text-center py-9 px-7 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[16px]">
            <p className="text-sm uppercase tracking-[2px] text-[rgba(255,255,255,0.5)] mb-4">
              Lifetime Income
            </p>
            <p className="text-[28px] font-mono font-medium text-gold">{toUSD(giTotalNet)}</p>
            <p className="text-sm text-[rgba(255,255,255,0.5)] mt-2">Net after taxes</p>
          </div>
          <div className="text-center py-9 px-7 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[16px]">
            <p className="text-sm uppercase tracking-[2px] text-[rgba(255,255,255,0.5)] mb-4">
              Net Improvement
            </p>
            <p className="text-[28px] font-mono font-medium text-[#4ade80]">{toUSD(lifetimeWealthDiff)}</p>
            <p className="text-sm text-[rgba(255,255,255,0.5)] mt-2">+{Math.round(lifetimeWealthPct * 100)}% over baseline</p>
          </div>
          <div className="text-center py-9 px-7 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[16px]">
            <p className="text-sm uppercase tracking-[2px] text-[rgba(255,255,255,0.5)] mb-4">
              Legacy to Heirs
            </p>
            <p className="text-[28px] font-mono font-medium text-gold">{toUSD(blueNetLegacy)}</p>
            <p className="text-sm text-[rgba(255,255,255,0.5)] mt-2">After heir taxes</p>
          </div>
        </div>

        {/* 5. Wealth Trajectory Chart (taller) */}
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[16px] p-9 mb-12">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-medium mb-1">Wealth Over Time</h2>
              <p className="text-sm text-[rgba(255,255,255,0.5)]">
                Total wealth if client passes at each age (GI payments + legacy - costs)
              </p>
            </div>
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
          <div className="h-[300px]">
            <WealthChart data={chartData} breakEvenAge={chartBreakEvenAge} />
          </div>
        </div>

        {/* 6. The Protection Promise */}
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-8 mb-12">
          <p className="text-xs uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] mb-5 font-medium">
            The Guarantee
          </p>

          {depletionAge && (
            <p className="text-base text-[rgba(255,255,255,0.6)] mb-5">
              Your Account Value is projected to deplete at age {depletionAge}.
            </p>
          )}

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
        </div>

        {/* 7. Year-by-Year Table (Income View only for presentation) */}
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] overflow-hidden mb-12">
          <div className="px-6 py-5 border-b border-[rgba(255,255,255,0.07)]">
            <p className="text-xs uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] font-medium">
              Year-by-Year Projection
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[rgba(255,255,255,0.02)]">
                  <th className="text-left px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Year</th>
                  <th className="text-left px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Age</th>
                  <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Guaranteed Income</th>
                  <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Net Income</th>
                  <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Cumulative</th>
                  <th className="text-right px-4 py-3 text-xs uppercase text-[rgba(255,255,255,0.5)] tracking-[1px] font-medium">Account Value</th>
                </tr>
              </thead>
              <tbody>
                {giYearlyData.slice(0, 20).map((row, idx) => {
                  const isDepletionRow = depletionAge && row.age === depletionAge && row.accountValue <= 0;
                  const isAccountZero = row.accountValue <= 0;

                  let cumulative = 0;
                  for (let i = 0; i <= idx; i++) {
                    cumulative += giYearlyData[i].guaranteedIncomeNet;
                  }

                  return (
                    <tr
                      key={row.year}
                      className={cn(
                        "border-b border-[rgba(255,255,255,0.03)]",
                        isDepletionRow && "bg-[rgba(212,175,55,0.03)] border-l-[3px] border-l-gold"
                      )}
                    >
                      <td className="px-4 py-3 text-sm font-mono text-[rgba(255,255,255,0.6)]">{row.year}</td>
                      <td className="px-4 py-3 text-sm text-[rgba(255,255,255,0.5)]">{row.age}</td>
                      <td className="px-4 py-3 text-sm font-mono text-right text-gold">
                        {row.guaranteedIncomeGross > 0 ? toUSD(row.guaranteedIncomeGross) : "—"}
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {giYearlyData.length > 20 && (
            <div className="px-6 py-3 border-t border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)]">
              <p className="text-sm text-[rgba(255,255,255,0.4)] italic text-center">
                Showing first 20 years · Full projection available in report view
              </p>
            </div>
          )}

          {depletionAge && (
            <div className="px-6 py-3 border-t border-[rgba(255,255,255,0.07)] bg-[rgba(212,175,55,0.03)]">
              <p className="text-sm text-gold italic">
                Income continues for life after account depletion
              </p>
            </div>
          )}
        </div>

        {/* 8. Disclaimer */}
        <p className="text-sm text-[rgba(255,255,255,0.4)] italic text-center max-w-[800px] mx-auto py-8">
          This optimized plan is for educational purposes only. Before making a Roth conversion or purchasing an annuity, discuss your final plan with a tax professional and licensed insurance agent.
        </p>
      </div>
    </div>
  );
}
