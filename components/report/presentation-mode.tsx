"use client";

import { useRef, useState, useEffect } from "react";
import { useProjection } from "@/lib/queries/projections";
import { WealthChart } from "@/components/results/wealth-chart";
import { transformToChartData, transformToGIChartData } from "@/lib/calculations/transforms";
import { isGuaranteedIncomeProduct, type FormulaType } from "@/lib/config/products";
import type { Client } from "@/lib/types/client";
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
      <div className="fixed inset-0 bg-background z-50 flex items-center justify-center">
        <div className="text-text-muted">Loading presentation...</div>
      </div>
    );
  }

  const { projection } = projectionResponse;
  const isGI = client.blueprint_type
    ? isGuaranteedIncomeProduct(client.blueprint_type as FormulaType)
    : false;

  const chartHeirTaxRate = (client.heir_tax_rate ?? 40) / 100;
  const chartData = isGI
    ? transformToGIChartData(projection, chartHeirTaxRate)
    : transformToChartData(projection, chartHeirTaxRate);

  // Calculate break-even from chart data (lifetime wealth trajectory, not raw netWorth)
  const chartBreakEvenAge = chartData.find(d => d.formula > d.baseline)?.age ?? null;

  // Helper methods
  const toUSD = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount / 100);

  // Lifetime Wealth = final net worth − heir tax on remaining traditional.
  // MUST mirror the main report dashboard formula (growth-report-dashboard.tsx
  // computes blueLifetimeWealth = blueprint_final_net_worth − blueHeirTax).
  // The previous version of this file subtracted lifetime federal/state tax
  // and IRMAA on top of the net legacy — but the engine ALREADY reduces
  // account balances by those costs as they're paid each year. Subtracting
  // them again double-counted, producing a smaller "Net Improvement" on the
  // Present view than the main dashboard. (Scott Kenik ticket 5adba41e —
  // Sprengel showed +$5,273,388 on main vs +$4,627,552 on present.)
  // For Growth: net legacy is the answer. For GI: the same legacy + the
  // total net guaranteed income paid out across the projection.
  const heirTaxRate = (client.heir_tax_rate ?? 40) / 100;

  const calculateBaselineLifetimeWealth = (finalNetWorth: number) => {
    const baseHeirTax = Math.round(projection.baseline_final_traditional * heirTaxRate);
    return finalNetWorth - baseHeirTax;
  };

  const calculateFormulaLifetimeWealth = () => {
    const blueHeirTax = Math.round(projection.blueprint_final_traditional * heirTaxRate);
    return projection.blueprint_final_net_worth - blueHeirTax;
  };

  const calculateGIFormulaLifetimeWealthTotal = () => {
    // Mirror gi-report-dashboard.tsx exactly: net legacy is the answer,
    // and final_net_worth already includes the taxable bucket where any
    // accumulated GI income lives. Adding gi_total_net_paid on top would
    // double-count those dollars. (The pre-fix formula here added them
    // separately, but it ALSO used a netLegacy that excluded taxable —
    // so the add was canceling the omission. Now that we use the proper
    // final_net_worth, the add is no longer needed.)
    const blueHeirTax = Math.round(projection.blueprint_final_traditional * heirTaxRate);
    return projection.blueprint_final_net_worth - blueHeirTax;
  };

  const baseLifetime = calculateBaselineLifetimeWealth(projection.baseline_final_net_worth);
  const blueLifetime = isGI
    ? calculateGIFormulaLifetimeWealthTotal()
    : calculateFormulaLifetimeWealth();

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
      className="fixed inset-0 bg-background z-50 overflow-y-auto text-foreground relative"
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
      <div className="sticky top-0 z-50 px-8 py-3 flex justify-between items-center bg-background/90 backdrop-blur-xl border-b border-border-default">
        <div className="flex items-center gap-4">
          <button
            onClick={onExit}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-text-muted border border-border-default rounded-[10px] hover:bg-bg-input transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Exit
          </button>
          <span className="text-sm text-text-dim">
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
                ? "text-gold border border-gold bg-accent"
                : "text-text-muted border border-border-default hover:bg-bg-input"
            }`}
          >
            <Pencil className="h-4 w-4" />
            {annotation.isActive ? "Stop Drawing" : "Annotate"}
          </button>
          {annotation.isActive && annotation.annotations.length > 0 && (
            <button
              onClick={annotation.clearAll}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-text-muted border border-border-default rounded-[10px] hover:bg-bg-input transition-colors"
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
          <p className="text-sm uppercase tracking-[3px] text-text-muted mb-4">
            Retirement Strategy Analysis
          </p>
          <h1 className="font-display text-[52px] font-normal mb-3">{client.name}</h1>
          <p className="text-lg text-text-muted">
            Age {client.age}
            {(client.filing_status === "married_filing_jointly" || client.filing_status === "married_filing_separately")
              && client.spouse_name
              && ` & ${client.spouse_name}, ${client.spouse_age}`} ·{" "}
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
              sub: `${percentChange >= 0 ? "+" : ""}${Math.round(percentChange * 100)}% over do-nothing`,
            },
            {
              label: "Legacy to Heirs",
              value: toUSD(projection.blueprint_final_roth + projection.blueprint_final_traditional * 0.6),
              sub: "After heir taxes",
            },
          ].map((m) => (
            <div
              key={m.label}
              className="text-center py-9 px-7 bg-bg-card border border-border-default rounded-[16px]"
            >
              <p className="text-sm uppercase tracking-[2px] text-text-muted mb-[18px]">
                {m.label}
              </p>
              <p className="text-[32px] font-mono font-medium text-gold">{m.value}</p>
              <p className="text-sm text-text-muted mt-2">{m.sub}</p>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="bg-bg-card border border-border-default rounded-[16px] p-9 mb-16">
          <div className="text-center mb-6">
            <h2 className="text-xl font-medium mb-2">Lifetime Wealth Trajectory</h2>
            <p className="text-sm text-text-muted">
              {isGI
                ? "Total wealth if client passes at each age (GI payments + legacy - costs)"
                : "Total wealth if client passes at each age (distributions + legacy - costs)"}
            </p>
            <div className="flex justify-center gap-8 mt-4 text-xs">
              <span className="flex items-center gap-2 text-gold">
                <span className="w-3.5 h-0.5 bg-gold rounded" />
                Strategy {isGI ? "(GI + Roth)" : "(Roth)"}
              </span>
              <span className="flex items-center gap-2 text-text-muted">
                <span
                  className="w-3.5 h-0.5 rounded"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(90deg, var(--chart-muted) 0px, var(--chart-muted) 4px, transparent 4px, transparent 6px)",
                  }}
                />
                Baseline (Traditional)
              </span>
            </div>
          </div>
          <div className="h-[280px]">
            <WealthChart data={chartData} breakEvenAge={chartBreakEvenAge} />
          </div>
        </div>

        {/* Wealth Summary Bar */}
        <div className="bg-accent border border-gold-border rounded-[14px] p-6 flex justify-between items-center mb-16">
          <div>
            <p className="text-xs uppercase tracking-[1.5px] text-[rgba(212,175,55,0.8)] mb-1">
              Lifetime Wealth Improvement
            </p>
            <div className="flex items-center gap-8 mt-2">
              <div>
                <p className="text-xs text-text-muted">BASELINE</p>
                <p className="text-xl font-mono text-text-dim">{toUSD(baseLifetime)}</p>
              </div>
              <span className="text-xl text-text-dim">→</span>
              <div>
                <p className="text-xs text-[rgba(212,175,55,0.8)]">STRATEGY</p>
                <p className="text-xl font-mono font-semibold text-gold">{toUSD(blueLifetime)}</p>
              </div>
            </div>
          </div>
          <p className="text-4xl font-mono font-semibold text-gold">
            {percentChange >= 0 ? "+" : ""}{Math.round(percentChange * 100)}%
          </p>
        </div>

        {/* Disclaimer */}
        <p className="text-center text-sm text-text-dim italic py-8">
          This optimized plan is for educational purposes only. Before making a Roth conversion,
          discuss your final plan with a tax professional.
        </p>
      </div>
    </div>
  );
}
