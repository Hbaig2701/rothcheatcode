"use client";

import { use, useState, useMemo } from "react";
import { useClient } from "@/lib/queries/clients";
import { useProjection } from "@/lib/queries/projections";
import { InputDrawer } from "@/components/report/input-drawer";
import { ReportDashboard } from "@/components/report/report-dashboard";
import { PresentationMode } from "@/components/report/presentation-mode";
import { GIPresentationMode } from "@/components/report/gi-presentation-mode";
import { StoryMode } from "@/components/report/story-mode";
import { AnnotationOverlay } from "@/components/report/annotation-overlay";
import { Loader2, ArrowLeft, Settings2, ChevronDown, Play, FileText, Copy, Pencil, BookOpen } from "lucide-react";
import { isGuaranteedIncomeProduct, type FormulaType } from "@/lib/config/products";
import type { YearlyResult } from "@/lib/calculations";

interface ResultsPageProps {
  params: Promise<{ id: string }>;
}

export default function ResultsPage({ params }: ResultsPageProps) {
  const { id } = use(params);
  const { data: client, isLoading: clientLoading } = useClient(id);
  const { data: projectionResponse, isLoading: projectionLoading } = useProjection(id);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [presentMode, setPresentMode] = useState(false);
  const [storyMode, setStoryMode] = useState(false);
  const [annotateMode, setAnnotateMode] = useState(false);

  // Calculate percentage change from projection data
  const percentChange = useMemo(() => {
    if (!projectionResponse?.projection || !client) return 0;

    const { projection } = projectionResponse;
    const isGI = client.blueprint_type
      ? isGuaranteedIncomeProduct(client.blueprint_type as FormulaType)
      : false;

    const sum = (years: YearlyResult[], key: keyof YearlyResult) =>
      years.reduce((acc, curr) => acc + (Number(curr[key]) || 0), 0);

    // Calculate baseline lifetime wealth
    const heirTaxRate = 0.40;
    const totalRMDs = sum(projection.baseline_years, 'rmdAmount');
    const totalBaselineTaxes = sum(projection.baseline_years, 'federalTax') + sum(projection.baseline_years, 'stateTax');
    const totalBaselineIRMAA = sum(projection.baseline_years, 'irmaaSurcharge');
    const afterTaxDistributions = totalRMDs - totalBaselineTaxes;
    const netBaselineLegacy = projection.baseline_final_net_worth * (1 - heirTaxRate);
    const baseLifetime = netBaselineLegacy + afterTaxDistributions - totalBaselineIRMAA;

    // Calculate formula/blueprint lifetime wealth
    let blueLifetime: number;
    if (isGI) {
      const giYearlyData = projection.gi_yearly_data || [];
      let conversionTaxes = 0;
      projection.blueprint_years.forEach((year, i) => {
        const giYear = giYearlyData[i];
        if (giYear && giYear.phase === 'deferral') {
          conversionTaxes += (year.federalTax + year.stateTax) || 0;
        }
      });
      const totalIRMAA = sum(projection.blueprint_years, 'irmaaSurcharge');
      const netLegacy = Math.round(projection.blueprint_final_traditional * (1 - heirTaxRate)) + projection.blueprint_final_roth;
      const giTotalNet = projection.gi_total_net_paid ?? 0;
      blueLifetime = giTotalNet + netLegacy - conversionTaxes - totalIRMAA;
    } else {
      // Growth strategy: net legacy (after heir taxes) minus conversion taxes minus IRMAA
      const totalTaxes = sum(projection.blueprint_years, 'federalTax') + sum(projection.blueprint_years, 'stateTax');
      const totalIRMAA = sum(projection.blueprint_years, 'irmaaSurcharge');
      const netLegacy = Math.round(projection.blueprint_final_traditional * (1 - heirTaxRate)) + projection.blueprint_final_roth;
      blueLifetime = netLegacy - totalTaxes - totalIRMAA;
    }

    const diff = blueLifetime - baseLifetime;
    return baseLifetime !== 0 ? diff / Math.abs(baseLifetime) : 0;
  }, [projectionResponse, client]);

  const isLoading = clientLoading || projectionLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0c0c0c]">
        <Loader2 className="h-8 w-8 animate-spin text-[rgba(255,255,255,0.25)]" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-9 text-white">
        <p className="text-[rgba(255,255,255,0.5)]">Client not found</p>
      </div>
    );
  }

  const delta = Math.round(percentChange * 100);
  const isGI = client.blueprint_type
    ? isGuaranteedIncomeProduct(client.blueprint_type as FormulaType)
    : false;

  // Story mode overlay - only for Growth products
  if (storyMode && !isGI && projectionResponse?.projection) {
    return (
      <StoryMode
        client={client}
        projection={projectionResponse.projection}
        onExit={() => setStoryMode(false)}
      />
    );
  }

  // Presentation mode overlay
  if (presentMode) {
    // Use GI-specific presentation mode for Guaranteed Income products
    if (isGI) {
      return (
        <GIPresentationMode
          client={client}
          onExit={() => setPresentMode(false)}
        />
      );
    }
    return (
      <PresentationMode
        client={client}
        onExit={() => setPresentMode(false)}
      />
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-0px)] overflow-hidden bg-[#0c0c0c]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-3.5 border-b border-[rgba(255,255,255,0.07)] bg-[rgba(0,0,0,0.2)] shrink-0">
        <div className="flex items-center gap-3.5">
          <a
            href={`/clients/${client.id}`}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-[rgba(255,255,255,0.07)] text-[rgba(255,255,255,0.5)] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </a>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-base font-medium text-white">{client.name}</span>
              <span
                className={`inline-block px-3 py-0.5 rounded-[20px] text-[13px] font-mono font-medium ${
                  delta >= 0
                    ? "bg-[rgba(74,222,128,0.08)] text-[#4ade80]"
                    : "bg-[rgba(248,113,113,0.08)] text-[#f87171]"
                }`}
              >
                {delta >= 0 ? "+" : ""}{delta}%
              </span>
            </div>
            <p className="text-sm text-[rgba(255,255,255,0.5)] mt-0.5">
              Age {client.age} · {client.filing_status === "married_filing_jointly" ? "MFJ" : client.filing_status === "single" ? "Single" : client.filing_status} · ${(client.qualified_account_value / 100000000).toFixed(1)}M · {client.product_name} · {client.carrier_name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Inputs button */}
          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-[10px] transition-all ${
              drawerOpen
                ? "text-gold border border-[rgba(212,175,55,0.3)] bg-[rgba(212,175,55,0.08)]"
                : "text-[rgba(255,255,255,0.7)] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] hover:border-[rgba(212,175,55,0.3)]"
            }`}
          >
            <Settings2 className="h-4 w-4" />
            Inputs
          </button>

          {/* Actions dropdown */}
          <div className="relative">
            <button
              onClick={() => setActionsOpen(!actionsOpen)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#0c0c0c] bg-gold rounded-[10px] hover:bg-[rgba(212,175,55,0.9)] transition-colors"
            >
              Actions
              <ChevronDown className="h-4 w-4" />
            </button>

            {actionsOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setActionsOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1.5 z-50 w-48 bg-[#1a1a1a] border border-[rgba(255,255,255,0.07)] rounded-[12px] p-1.5 shadow-xl">
                  <button
                    onClick={() => {
                      setPresentMode(true);
                      setActionsOpen(false);
                    }}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-[rgba(255,255,255,0.5)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg transition-colors text-left"
                  >
                    <Play className="h-4 w-4" />
                    Present
                  </button>
                  <button
                    onClick={() => setActionsOpen(false)}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-[rgba(255,255,255,0.5)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg transition-colors text-left"
                  >
                    <FileText className="h-4 w-4" />
                    Export as PDF
                  </button>
                  <button
                    onClick={() => setActionsOpen(false)}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-[rgba(255,255,255,0.5)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg transition-colors text-left"
                  >
                    <Copy className="h-4 w-4" />
                    Duplicate
                  </button>
                  <button
                    onClick={() => {
                      setAnnotateMode(true);
                      setActionsOpen(false);
                    }}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-[rgba(255,255,255,0.5)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg transition-colors text-left"
                  >
                    <Pencil className="h-4 w-4" />
                    Annotate
                  </button>
                  {/* Story Mode - Only for Growth products */}
                  {!isGI && (
                    <button
                      onClick={() => {
                        setStoryMode(true);
                        setActionsOpen(false);
                      }}
                      className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-[rgba(255,255,255,0.5)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg transition-colors text-left"
                    >
                      <BookOpen className="h-4 w-4" />
                      Story Mode
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Report Dashboard - Full width when drawer closed */}
        <div className="flex-1 h-full overflow-hidden">
          <ReportDashboard clientId={id} />
        </div>

        {/* Inputs Drawer - Slide out from right */}
        {drawerOpen && (
          <div className="w-[360px] shrink-0 h-full border-l border-[rgba(255,255,255,0.07)] bg-[rgba(0,0,0,0.2)] overflow-hidden">
            <InputDrawer client={client} onClose={() => setDrawerOpen(false)} />
          </div>
        )}
      </div>

      {/* Annotation Overlay */}
      {annotateMode && (
        <AnnotationOverlay onExit={() => setAnnotateMode(false)} />
      )}
    </div>
  );
}
