"use client";

import { use, useState, useMemo } from "react";
import { useClient } from "@/lib/queries/clients";
import { useProjection } from "@/lib/queries/projections";
import { InputDrawer } from "@/components/report/input-drawer";
import { ReportDashboard } from "@/components/report/report-dashboard";
import { PresentationMode } from "@/components/report/presentation-mode";
import { GIPresentationMode } from "@/components/report/gi-presentation-mode";
import { StoryMode } from "@/components/report/story-mode";
import { GIStoryMode } from "@/components/report/gi-story-mode";
import { AnnotationOverlay } from "@/components/report/annotation-overlay";
import { ExportPdfDialog } from "@/components/report/export-pdf-dialog";
import { Loader2, ArrowLeft, Settings2, ChevronDown, Play, Copy, Pencil, BookOpen, Download, Info, User, Heart, Wallet, Package } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { isGuaranteedIncomeProduct, type FormulaType } from "@/lib/config/products";
import type { YearlyResult } from "@/lib/calculations";
import type { Client } from "@/lib/types/client";
import type { Projection } from "@/lib/types/projection";

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
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  // Calculate percentage change from projection data
  const percentChange = useMemo(() => {
    if (!projectionResponse?.projection || !client) return 0;

    const { projection } = projectionResponse;
    const isGI = client.blueprint_type
      ? isGuaranteedIncomeProduct(client.blueprint_type as FormulaType)
      : false;

    // For GI products, use the pre-calculated percent improvement
    // This compares Roth GI (tax-free) vs Traditional GI (taxable)
    if (isGI) {
      // gi_percent_improvement is stored as a percentage (e.g., 31.5 for 31.5%)
      return (projection.gi_percent_improvement ?? 0) / 100;
    }

    // Lifetime Wealth = net legacy on both sides (apples-to-apples).
    const heirTaxRate = (client.heir_tax_rate ?? 40) / 100;

    // Baseline: heir tax only on traditional portion
    const baseHeirTax = Math.round(projection.baseline_final_traditional * heirTaxRate);
    const baseLifetime = projection.baseline_final_net_worth - baseHeirTax;

    // Strategy: heir tax only on remaining traditional, taxes already deducted in engine
    const blueHeirTax = Math.round(projection.blueprint_final_traditional * heirTaxRate);
    const blueLifetime = projection.blueprint_final_net_worth - blueHeirTax;

    const diff = blueLifetime - baseLifetime;
    return baseLifetime !== 0 ? diff / Math.abs(baseLifetime) : 0;
  }, [projectionResponse, client]);

  const isLoading = clientLoading || projectionLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-text-dim" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-9 text-foreground">
        <p className="text-text-muted">Client not found</p>
      </div>
    );
  }

  const delta = Math.round(percentChange * 100);
  const isGI = client.blueprint_type
    ? isGuaranteedIncomeProduct(client.blueprint_type as FormulaType)
    : false;

  // Story mode overlay
  if (storyMode && projectionResponse?.projection) {
    if (isGI) {
      return (
        <GIStoryMode
          client={client}
          projection={projectionResponse.projection}
          onClose={() => setStoryMode(false)}
        />
      );
    }
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
    <div className="flex flex-col h-[calc(100vh-0px)] overflow-hidden bg-background">
      {/* Top bar — theme-aware surface (was a hardcoded translucent black
          that read as a muddy gray block in light mode), tighter typography,
          and the legal disclaimer collapsed behind an info icon to free up
          vertical space. */}
      <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-border-default bg-bg-card shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <a
            href={`/clients/${client.id}`}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-border-default text-text-muted hover:bg-secondary hover:text-foreground transition-colors shrink-0"
            aria-label="Back to client"
          >
            <ArrowLeft className="h-4 w-4" />
          </a>
          <div className="min-w-0">
            {/* Title row: client name / scenario + delta badge + disclaimer info */}
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-base font-semibold text-foreground truncate">
                {client.name}
                <span className="text-text-muted font-normal mx-1.5">/</span>
                <span className="font-medium text-foreground/90">{client.scenario_name || client.product_name}</span>
              </h1>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-semibold shrink-0 ${
                  delta >= 0 ? "bg-green-bg text-green" : "bg-red-bg text-red"
                }`}
              >
                {delta >= 0 ? "+" : ""}{delta}%
              </span>
              <Tooltip>
                <TooltipTrigger
                  render={(props) => (
                    <button
                      {...props}
                      type="button"
                      className="text-text-dim hover:text-text-muted transition-colors shrink-0"
                      aria-label="Disclaimer"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  )}
                />
                <TooltipContent className="max-w-xs">
                  This report is for educational and illustrative purposes only.
                  Consult a qualified professional before making any financial decisions.
                </TooltipContent>
              </Tooltip>
            </div>
            {/* Metadata row: chips with icons, more readable than the old
                pipe-delimited string */}
            <div className="flex items-center gap-3 mt-1 text-[13px] text-text-muted">
              <span className="inline-flex items-center gap-1">
                <User className="h-3.5 w-3.5 opacity-70" />
                Age {client.age}
              </span>
              <span className="inline-flex items-center gap-1">
                <Heart className="h-3.5 w-3.5 opacity-70" />
                {client.filing_status === "married_filing_jointly"
                  ? "MFJ"
                  : client.filing_status === "single"
                  ? "Single"
                  : client.filing_status === "married_filing_separately"
                  ? "MFS"
                  : "HoH"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Wallet className="h-3.5 w-3.5 opacity-70" />
                ${(client.qualified_account_value / 100000000).toFixed(1)}M
              </span>
              <span className="inline-flex items-center gap-1 truncate">
                <Package className="h-3.5 w-3.5 opacity-70 shrink-0" />
                <span className="truncate">{client.product_name} · {client.carrier_name}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Inputs button */}
          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-[10px] transition-all ${
              drawerOpen
                ? "text-gold border border-border-hover bg-accent"
                : "text-text-muted border border-border-default bg-bg-input hover:border-border-hover"
            }`}
          >
            <Settings2 className="h-4 w-4" />
            Inputs
          </button>

          {/* Actions dropdown */}
          <div className="relative">
            <button
              onClick={() => setActionsOpen(!actionsOpen)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary-foreground bg-gold rounded-[10px] hover:bg-[rgba(212,175,55,0.9)] transition-colors"
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
                <div className="absolute right-0 top-full mt-1.5 z-50 w-48 bg-surface-elevated border border-border-default rounded-[12px] p-1.5 shadow-xl">
                  <button
                    onClick={() => {
                      setPresentMode(true);
                      setActionsOpen(false);
                    }}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-text-muted hover:bg-secondary rounded-lg transition-colors text-left"
                  >
                    <Play className="h-4 w-4" />
                    Present
                  </button>
                  <button
                    onClick={() => {
                      setExportDialogOpen(true);
                      setActionsOpen(false);
                    }}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-text-muted hover:bg-secondary rounded-lg transition-colors text-left"
                  >
                    <Download className="h-4 w-4" />
                    Export as PDF
                  </button>
                  <button
                    onClick={() => setActionsOpen(false)}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-text-muted hover:bg-secondary rounded-lg transition-colors text-left"
                  >
                    <Copy className="h-4 w-4" />
                    Duplicate
                  </button>
                  <button
                    onClick={() => {
                      setAnnotateMode(true);
                      setActionsOpen(false);
                    }}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-text-muted hover:bg-secondary rounded-lg transition-colors text-left"
                  >
                    <Pencil className="h-4 w-4" />
                    Annotate
                  </button>
                  {/* Story Mode */}
                  <button
                    onClick={() => {
                      setStoryMode(true);
                      setActionsOpen(false);
                    }}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-text-muted hover:bg-secondary rounded-lg transition-colors text-left"
                  >
                    <BookOpen className="h-4 w-4" />
                    Story Mode
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main content area. The drawer is positioned absolutely so opening it
          OVERLAYS the report instead of pushing the dashboard's flex-1 width
          down — that's what was causing all the chart numbers + stat cards to
          re-flow and look squished whenever the input panel was open. */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Report Dashboard - always full width */}
        <div className="flex-1 min-w-0 h-full overflow-hidden">
          <ReportDashboard clientId={id} />
        </div>

        {/* Inputs Drawer - slides over the right side of the report.
            Width is 600px on desktop (gives the withdrawal table its 560px
            min-width plus padding without horizontal scroll), full-width
            on narrow screens. Solid background + shadow so it doesn't read
            through the report behind it. */}
        {drawerOpen && (
          <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[600px] max-w-[95vw] shrink-0 border-l border-border-default bg-background shadow-[0_0_40px_rgba(0,0,0,0.4)] overflow-hidden z-30">
            <InputDrawer client={client} onClose={() => setDrawerOpen(false)} />
          </div>
        )}
      </div>

      {/* Annotation Overlay */}
      {annotateMode && (
        <AnnotationOverlay onExit={() => setAnnotateMode(false)} />
      )}

      {/* Export PDF Dialog */}
      {client && projectionResponse?.projection && (
        <ExportPdfDialog
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
          client={client}
          projection={projectionResponse.projection}
        />
      )}
    </div>
  );
}
