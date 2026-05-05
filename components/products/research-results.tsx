"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, Sparkles, ExternalLink, Pencil } from "lucide-react";
import { ManualBuilder } from "./manual-builder";
import {
  ARCHETYPE_LABELS,
  type ProductConfigPayload,
  type ProductArchetype,
  type AISource,
  type AIWarning,
  type UnsupportedFeature,
  type ConfidenceLevel,
  type CustomProductRow,
} from "@/lib/products/types";

export interface ResearchResult {
  product_found: boolean;
  category: "growth" | "income";
  archetype: ProductArchetype;
  carrier: string | null;
  carrier_product_name: string | null;
  suggested_generic_name: string;
  config: ProductConfigPayload;
  modifier_flags?: string[];
  sources: AISource[];
  warnings: AIWarning[];
  unsupported_features: UnsupportedFeature[];
  source: "ai_research" | "ai_document";
}

interface ResearchResultsProps {
  result: ResearchResult;
  onSaved: (product: CustomProductRow) => void;
  onCancel: () => void;
}

export function ResearchResults({ result, onSaved, onCancel }: ResearchResultsProps) {
  const [showFullEdit, setShowFullEdit] = useState(false);

  if (showFullEdit) {
    return (
      <ManualBuilder
        initialCategory={result.category}
        initialName={result.suggested_generic_name}
        initialArchetype={result.archetype}
        initialConfig={result.config}
        initialCarrier={result.carrier}
        initialCarrierProduct={result.carrier_product_name}
        initialFlags={result.modifier_flags as never}
        initialSource={result.source}
        initialAISources={result.sources}
        initialAIWarnings={result.warnings}
        initialUnsupported={result.unsupported_features}
        onSaved={onSaved}
        onCancel={() => setShowFullEdit(false)}
      />
    );
  }

  const archetypeLabel = ARCHETYPE_LABELS[result.archetype] ?? result.archetype;
  const isWebResearch = result.source === "ai_research";

  // Defensive guards — AI sometimes returns partial config
  const cfg = result.config ?? ({} as ResearchResult["config"]);
  const bonus = cfg.bonus ?? { percentage: 0, type: "none" as const };
  const surrender = cfg.surrender ?? { years: 0, schedule: [] };
  const fees = cfg.fees ?? { annual_rider_fee: 0, fee_duration: "surrender_period" as const };
  const withdrawals = cfg.withdrawals ?? { penalty_free_percent: 0, year_1_rule: "same" as const, cumulative_withdrawal: false };
  const other = cfg.other ?? { mva_applies: false };

  return (
    <div className="space-y-5">
      {/* Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-green-300/40 bg-green-50/30 p-4 dark:bg-green-950/20">
        <CheckCircle2 className="size-5 shrink-0 mt-0.5 text-green-600" />
        <div className="flex-1">
          <h3 className="font-semibold text-base">Product Found</h3>
          {result.carrier_product_name && (
            <p className="text-sm font-medium uppercase tracking-wide text-foreground/80 mt-1">
              {result.carrier_product_name}
              {result.carrier && <span className="text-muted-foreground font-normal"> · {result.carrier}</span>}
            </p>
          )}
          <p className="text-sm text-muted-foreground mt-1">
            We matched this to: <span className="font-medium text-foreground">{archetypeLabel}</span>
          </p>
        </div>
      </div>

      {/* Web research verification warning */}
      {isWebResearch && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-50/40 p-4 dark:bg-amber-950/20">
          <AlertTriangle className="size-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-500" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-amber-900 dark:text-amber-200 mb-1">
              Verify these values before client use
            </p>
            <p className="text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
              These parameters were extracted from third-party web sources, which can be outdated or carrier-specific.
              <strong className="font-semibold"> Cross-check against an official carrier illustration or spec sheet</strong> before relying on this product in client projections.
            </p>
            <p className="text-xs text-amber-800/70 dark:text-amber-300/70 mt-2">
              For maximum accuracy, cancel and use the &ldquo;Upload a brochure&rdquo; flow with the carrier&apos;s PDF.
            </p>
          </div>
        </div>
      )}

      {/* Sources */}
      {result.sources.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Sources Used
          </h4>
          <ul className="space-y-1">
            {result.sources.map((s, i) => (
              <li key={i} className="text-sm flex items-center gap-2">
                <ExternalLink className="size-3 text-muted-foreground" />
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline truncate"
                >
                  {s.url}
                </a>
                <Badge variant="outline" className="text-[10px]">{formatSourceType(s.type)}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Summary parameters */}
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Product Summary
        </h4>
        <SummaryRow label="Premium Bonus" value={`${bonus.percentage ?? 0}%`} confidence={bonus.confidence} />
        <SummaryRow
          label="Bonus Type"
          value={formatBonusTypeDisplay(bonus.type, bonus.vesting_years, bonus.anniversary_rate, bonus.anniversary_years)}
          confidence={bonus.confidence}
        />
        <SummaryRow label="Surrender Period" value={`${surrender.years ?? 0} years`} confidence={surrender.confidence} />
        <SummaryRow label="Annual Rider Fee" value={`${fees.annual_rider_fee ?? 0}%`} confidence={fees.confidence} />
        <SummaryRow label="Free Withdrawal" value={`${withdrawals.penalty_free_percent ?? 0}%`} confidence={withdrawals.confidence} />
        {other.return_of_premium_year != null && (
          <SummaryRow
            label="Return of Premium"
            value={`After year ${other.return_of_premium_year}`}
            confidence={other.confidence}
          />
        )}
        {cfg.income && (
          <>
            <SummaryRow
              label="Roll-up"
              value={`${cfg.income.roll_up_rate ?? 0}% ${cfg.income.roll_up_type === "compound" ? "Compound" : "Simple"}${cfg.income.roll_up_split_rate ? " (Split rate)" : ""}`}
              confidence={cfg.income.confidence}
            />
            <SummaryRow label="Roll-up Max" value={`${cfg.income.roll_up_max_years ?? 0} years`} confidence={cfg.income.confidence} />
          </>
        )}
      </section>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <section className="rounded-lg border border-yellow-300/40 bg-yellow-50/30 p-4 dark:bg-yellow-950/20">
          <h4 className="flex items-center gap-2 text-sm font-semibold mb-3">
            <AlertTriangle className="size-4 text-yellow-700 dark:text-yellow-500" />
            Heads up — please double-check
          </h4>
          <ul className="space-y-3 text-sm">
            {result.warnings.map((w, i) => (
              <li key={i} className="leading-relaxed">
                <span className="font-medium text-foreground">{humanizeFieldName(w.field)}:</span>{" "}
                <span className="text-muted-foreground">{w.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Unsupported features */}
      {result.unsupported_features.length > 0 && (
        <section className="rounded-lg border border-orange-300/40 bg-orange-50/30 p-4 dark:bg-orange-950/20">
          <h4 className="flex items-center gap-2 text-sm font-semibold mb-2">
            <AlertTriangle className="size-4 text-orange-700 dark:text-orange-500" />
            Some Features Won&apos;t Be Modeled
          </h4>
          <ul className="space-y-3 text-sm">
            {result.unsupported_features.map((f, i) => (
              <li key={i}>
                <div className="font-medium">{f.feature}</div>
                <div className="text-muted-foreground text-xs mt-0.5">{f.description}</div>
                <div className="text-xs mt-1">
                  <span className="font-medium">Approach:</span> {f.approach}{" "}
                  <Badge variant="outline" className={
                    f.impact === "low" ? "border-green-300 text-green-700"
                    : f.impact === "medium" ? "border-yellow-300 text-yellow-700"
                    : "border-red-300 text-red-700"
                  }>
                    {f.impact} impact
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Generic naming notice */}
      <div className="rounded-lg bg-muted/40 p-3 text-sm">
        <p className="font-medium mb-1">
          <Sparkles className="size-3.5 inline mr-1 -mt-0.5" />
          We&apos;ll save this as: <span className="font-semibold">{result.suggested_generic_name}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Generic names are recommended for compliance. The original carrier name is stored privately and never shown on reports. You can edit the name on the next step.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 pt-4 border-t border-border">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => setShowFullEdit(true)}>
          <Pencil className="size-4" />
          Review &amp; Save
        </Button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, confidence }: { label: string; value: string; confidence?: ConfidenceLevel }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-medium">{value}</span>
        <ConfidenceBadge level={confidence} />
      </span>
    </div>
  );
}

// Map raw field paths from the AI to advisor-friendly labels
const FIELD_LABEL_MAP: Record<string, string> = {
  "bonus.percentage": "Premium Bonus",
  "bonus.type": "Bonus Type",
  "bonus.vesting_years": "Vesting Period",
  "bonus.vesting_schedule": "Vesting Schedule",
  "bonus.anniversary_rate": "Anniversary Bonus Rate",
  "bonus.anniversary_years": "Anniversary Bonus Years",
  "bonus.applies_to": "Bonus Applies To",
  "bonus.anniversary": "Anniversary Bonus",
  "surrender.years": "Surrender Period",
  "surrender.schedule": "Surrender Schedule",
  "fees.annual_rider_fee": "Annual Rider Fee",
  "fees.fee_duration": "Fee Duration",
  "withdrawals.penalty_free_percent": "Free Withdrawal %",
  "withdrawals.year_1_rule": "Year 1 Withdrawal Rule",
  "withdrawals.cumulative_withdrawal": "Cumulative Withdrawal",
  "income.roll_up_type": "Roll-up Type",
  "income.roll_up_rate": "Roll-up Rate",
  "income.roll_up_max_years": "Roll-up Max Years",
  "income.payout_factors": "Payout Factors",
  "income.bonus_applies_to": "Income Bonus Applies To",
  "other.mva_applies": "Market Value Adjustment",
  "other.return_of_premium_year": "Return of Premium",
  "other.min_premium": "Minimum Premium",
  "other.max_premium": "Maximum Premium",
  "other.min_issue_age": "Minimum Issue Age",
  "other.max_issue_age": "Maximum Issue Age",
  "state_availability": "State Availability",
  "archetype": "Product Archetype",
  "category": "Product Category",
};

function humanizeFieldName(raw: string): string {
  if (!raw) return "Note";
  const exact = FIELD_LABEL_MAP[raw.toLowerCase()];
  if (exact) return exact;
  // Fallback: convert "some.thing_here" → "Some Thing Here"
  return raw
    .split(".")
    .map((part) =>
      part
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ")
    )
    .join(" — ");
}

function ConfidenceBadge({ level }: { level?: ConfidenceLevel }) {
  if (!level) return null;
  if (level === "verified") {
    return <Badge variant="outline" className="border-green-300 text-green-700 dark:border-green-800 dark:text-green-400 text-[10px]">Verified</Badge>;
  }
  if (level === "assumed") {
    return <Badge variant="outline" className="border-yellow-300 text-yellow-700 dark:border-yellow-800 dark:text-yellow-400 text-[10px]">Assumed</Badge>;
  }
  if (level === "partial") {
    return <Badge variant="outline" className="border-yellow-300 text-yellow-700 dark:border-yellow-800 dark:text-yellow-400 text-[10px]">Partial</Badge>;
  }
  return <Badge variant="outline" className="border-red-300 text-red-700 dark:border-red-800 dark:text-red-400 text-[10px]">Missing</Badge>;
}

function formatSourceType(type: string): string {
  if (type === "official") return "Official";
  if (type === "third_party") return "Third-party";
  if (type === "uploaded_document") return "Your document";
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatBonusTypeDisplay(type: string, vesting_years?: number | null, anniversary_rate?: number | null, anniversary_years?: number | null): string {
  if (type === "vesting") return `Vesting (${vesting_years ?? "?"}-year schedule)`;
  if (type === "phased") return `Phased (+${anniversary_rate ?? "?"}% × ${anniversary_years ?? "?"} years)`;
  if (type === "immediate") return "Immediate (fully credited at issue)";
  if (type === "none") return "None";
  return type.charAt(0).toUpperCase() + type.slice(1);
}
