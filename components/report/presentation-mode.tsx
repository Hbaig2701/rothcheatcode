"use client";

import { useRef, useState, useEffect } from "react";
import { useProjection } from "@/lib/queries/projections";
import { WealthChart } from "@/components/results/wealth-chart";
import { transformToChartData, transformToGIChartData } from "@/lib/calculations/transforms";
import { isGuaranteedIncomeProduct, type FormulaType } from "@/lib/config/products";
import type { Client } from "@/lib/types/client";
import type { YearlyResult } from "@/lib/calculations";
import { ArrowLeft, Pencil, X } from "lucide-react";
import { useAnnotation } from "@/hooks/use-annotation";
import { AnnotationCanvas } from "@/components/report/annotation-canvas";

interface PresentationModeProps {
  client: Client;
  onExit: () => void;
}

export function PresentationMode({ client, onExit }: PresentationModeProps) {
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
  const isGI = client.blueprint_type
    ? isGuaranteedIncomeProduct(client.blueprint_type as FormulaType)
    : false;

  const chartData = isGI
    ? transformToGIChartData(projection)
    : transformToChartData(projection);

  // Helper methods
  const sum = (years: YearlyResult[], key: keyof YearlyResult) =>
    years.reduce((acc, curr) => acc + (Number(curr[key]) || 0), 0);

  const toUSD = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount / 100);

  // Calculate Lifetime Wealth
  const calculateFormulaLifetimeWealth = (years: YearlyResult[], finalNetWorth: number) => {
    const totalTaxes = sum(years, "federalTax") + sum(years, "stateTax");
    const totalIRMAA = sum(years, "irmaaSurcharge");
    return finalNetWorth - totalTaxes - totalIRMAA;
  };

  const calculateGIFormulaLifetimeWealthTotal = () => {
    const heirTaxRate = 0.4;
    const giYearlyData = projection.gi_yearly_data || [];
    let conversionTaxes = 0;
    projection.blueprint_years.forEach((year, i) => {
      const giYear = giYearlyData[i];
      if (giYear && giYear.phase === "deferral") {
        conversionTaxes += (year.federalTax + year.stateTax) || 0;
      }
    });
    const totalIRMAA = sum(projection.blueprint_years, "irmaaSurcharge");
    const netLegacy =
      Math.round(projection.blueprint_final_traditional * (1 - heirTaxRate)) +
      projection.blueprint_final_roth;
    const giTotalNet = projection.gi_total_net_paid ?? 0;
    return giTotalNet + netLegacy - conversionTaxes - totalIRMAA;
  };

  const calculateBaselineLifetimeWealth = (years: YearlyResult[], finalNetWorth: number) => {
    const heirTaxRate = 0.4;
    const totalRMDs = sum(years, "rmdAmount");
    const totalTaxes = sum(years, "federalTax") + sum(years, "stateTax");
    const totalIRMAA = sum(years, "irmaaSurcharge");
    const afterTaxDistributions = totalRMDs - totalTaxes;
    const netLegacy = finalNetWorth * (1 - heirTaxRate);
    return netLegacy + afterTaxDistributions - totalIRMAA;
  };

  const baseLifetime = calculateBaselineLifetimeWealth(
    projection.baseline_years,
    projection.baseline_final_net_worth
  );
  const blueLifetime = isGI
    ? calculateGIFormulaLifetimeWealthTotal()
    : calculateFormulaLifetimeWealth(
        projection.blueprint_years,
        projection.blueprint_final_net_worth
      );

  const diff = blueLifetime - baseLifetime;
  const percentChange = baseLifetime !== 0 ? diff / Math.abs(baseLifetime) : 0;

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

  // Mouse event handlers that extract point coordinates
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
      <div className="sticky top-0 z-50 px-8 py-3 flex justify-between items-center bg-[rgba(12,12,12,0.9)] backdrop-blur-xl border-b border-[rgba(255,255,255,0.07)]">
        <div className="flex items-center gap-4">
          <button
            onClick={onExit}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-[rgba(255,255,255,0.5)] border border-[rgba(255,255,255,0.07)] rounded-[10px] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Exit
          </button>
          <span className="text-[13px] text-[rgba(255,255,255,0.25)]">
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
      <div className="max-w-[1000px] mx-auto px-10 py-16">
        {/* Title Section */}
        <div className="text-center mb-20">
          <div className="w-[60px] h-[3px] bg-gold rounded mx-auto mb-7" />
          <p className="text-sm uppercase tracking-[3px] text-[rgba(255,255,255,0.5)] mb-4">
            Retirement Strategy Analysis
          </p>
          <h1 className="font-display text-[52px] font-normal mb-3">{client.name}</h1>
          <p className="text-lg text-[rgba(255,255,255,0.5)]">
            Age {client.age}
            {client.spouse_name && ` & ${client.spouse_name}, ${client.spouse_age}`} ·{" "}
            {formatFilingStatus(client.filing_status)} ·{" "}
            ${(client.qualified_account_value / 100000000).toFixed(1)}M
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-3 gap-6 mb-16">
          {[
            {
              label: "Lifetime Wealth",
              value: toUSD(blueLifetime),
              sub: `vs ${toUSD(baseLifetime)} baseline`,
            },
            {
              label: "Net Improvement",
              value: toUSD(diff),
              sub: `+${Math.round(percentChange * 100)}% over do-nothing`,
            },
            {
              label: "Legacy to Heirs",
              value: toUSD(projection.blueprint_final_roth + projection.blueprint_final_traditional * 0.6),
              sub: "After heir taxes",
            },
          ].map((m) => (
            <div
              key={m.label}
              className="text-center py-9 px-7 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[16px]"
            >
              <p className="text-sm uppercase tracking-[2px] text-[rgba(255,255,255,0.5)] mb-[18px]">
                {m.label}
              </p>
              <p className="text-[32px] font-mono font-medium text-gold">{m.value}</p>
              <p className="text-sm text-[rgba(255,255,255,0.5)] mt-2">{m.sub}</p>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[16px] p-9 mb-16">
          <div className="text-center mb-6">
            <h2 className="text-xl font-medium mb-2">Lifetime Wealth Trajectory</h2>
            <p className="text-sm text-[rgba(255,255,255,0.5)]">
              {isGI
                ? "Total wealth if client passes at each age (GI payments + legacy - costs)"
                : "Total wealth if client passes at each age (distributions + legacy - costs)"}
            </p>
            <div className="flex justify-center gap-8 mt-4 text-xs">
              <span className="flex items-center gap-2 text-gold">
                <span className="w-3.5 h-0.5 bg-gold rounded" />
                Strategy {isGI ? "(GI + Roth)" : "(Roth)"}
              </span>
              <span className="flex items-center gap-2 text-[rgba(255,255,255,0.5)]">
                <span
                  className="w-3.5 h-0.5 rounded"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(90deg, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 4px, transparent 4px, transparent 6px)",
                  }}
                />
                Baseline (Traditional)
              </span>
            </div>
          </div>
          <div className="h-[280px]">
            <WealthChart data={chartData} breakEvenAge={projection.break_even_age} />
          </div>
        </div>

        {/* Wealth Summary Bar */}
        <div className="bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.2)] rounded-[14px] p-6 flex justify-between items-center mb-16">
          <div>
            <p className="text-xs uppercase tracking-[1.5px] text-[rgba(212,175,55,0.8)] mb-1">
              Lifetime Wealth Improvement
            </p>
            <div className="flex items-center gap-8 mt-2">
              <div>
                <p className="text-xs text-[rgba(255,255,255,0.5)]">BASELINE</p>
                <p className="text-xl font-mono text-[rgba(255,255,255,0.6)]">{toUSD(baseLifetime)}</p>
              </div>
              <span className="text-xl text-[rgba(255,255,255,0.4)]">→</span>
              <div>
                <p className="text-xs text-[rgba(212,175,55,0.8)]">STRATEGY</p>
                <p className="text-xl font-mono font-semibold text-gold">{toUSD(blueLifetime)}</p>
              </div>
            </div>
          </div>
          <p className="text-4xl font-mono font-semibold text-gold">
            +{Math.round(percentChange * 100)}%
          </p>
        </div>

        {/* Disclaimer */}
        <p className="text-center text-sm text-[rgba(255,255,255,0.4)] italic py-8">
          This optimized plan is for educational purposes only. Before making a Roth conversion,
          discuss your final plan with a tax professional.
        </p>
      </div>
    </div>
  );
}
