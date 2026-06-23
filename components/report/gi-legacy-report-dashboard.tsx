"use client";

import { useState } from "react";
import type { Projection } from "@/lib/types/projection";
import type { Client } from "@/lib/types/client";
import { WidowSection } from "@/components/report/widow-section";
import { TaxFundingNotice } from "@/components/report/tax-funding-notice";
import { YearByYearTable } from "@/components/results/deep-dive/year-by-year-table";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Legacy / no-income report for guaranteed-income products run in legacy mode
 * (client.gi_legacy_mode). The income story doesn't apply — the annuity is
 * converted to Roth and held for heirs — so this tells the LEGACY story instead:
 *
 *  - the tax-free death benefit (the rolled-up benefit base, paid over 5 years),
 *  - vs. doing nothing (traditional: forced RMDs drain it, heirs are taxed),
 *  - the forced RMDs + RMD taxes avoided, and the one-time conversion cost,
 *  - the year-by-year playbook.
 *
 * All driven by the engine's benefit-base + RMD-eroded-baseline data — exactly
 * what David Abreu asked for (@8:02: "legacy to heirs… the tax cost… savings
 * based on RMDs… the year-by-year table").
 */
interface Props {
  client: Client;
  projection: Projection;
}

const toUSD = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

const last = <T,>(arr: T[] | null | undefined): T | undefined => (arr && arr.length ? arr[arr.length - 1] : undefined);
const sum = (arr: { [k: string]: number }[] | null | undefined, key: string) =>
  (arr ?? []).reduce((s, r) => s + (Number(r[key]) || 0), 0);

export function GILegacyReportDashboard({ client, projection }: Props) {
  const [tableView, setTableView] = useState<"strategy" | "baseline">("strategy");
  const [productDetailsOpen, setProductDetailsOpen] = useState(false);

  const heirRate = (client.heir_tax_rate ?? 40) / 100;

  // --- Death benefit = the rolled-up benefit base (paid to heirs over 5 yrs) ---
  const strategyDB = last(projection.gi_yearly_data)?.incomeBase ?? 0;        // Roth — tax-free
  const baselineDB = last(projection.gi_baseline_yearly_data)?.incomeBase ?? 0; // Traditional — taxable, RMD-eroded

  // --- Taxable side: strategy leftover; baseline = accumulated after-tax RMDs ---
  const strategyTaxable = last(projection.blueprint_years)?.taxableBalance ?? 0;
  const baselineTaxable = last(projection.baseline_years)?.taxableBalance ?? 0;

  // --- Net legacy to heirs (apples-to-apples) ---
  const strategyLegacy = strategyDB + strategyTaxable;                            // Roth DB is tax-free
  const baselineLegacy = Math.round(baselineDB * (1 - heirRate)) + baselineTaxable; // traditional DB taxed to heirs
  const additionalLegacy = strategyLegacy - baselineLegacy;
  const winning = additionalLegacy >= 0;

  // --- What converting avoids ---
  const lifetimeRMD = sum(projection.baseline_years as unknown as { [k: string]: number }[], "rmdAmount");
  const lifetimeRMDTax =
    sum(projection.baseline_years as unknown as { [k: string]: number }[], "federalTax") +
    sum(projection.baseline_years as unknown as { [k: string]: number }[], "stateTax");
  const heirTaxAvoided = Math.round(baselineDB * heirRate);
  const conversionTax = projection.gi_total_conversion_tax ?? 0;

  const finalAge = last(projection.blueprint_years)?.age ?? client.end_age;

  return (
    <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden">
      <TaxFundingNotice
        client={client}
        taxFundedFromIra={(projection.blueprint_years ?? []).some((y) => (y.taxesPaidFromIRA ?? 0) > 0)}
      />
      <div className="p-9 space-y-6">
        {/* Hero: the tax-free death benefit */}
        <div className="bg-accent border border-gold-border rounded-[16px] py-10 px-12 text-center">
          <p className="text-sm uppercase tracking-[3px] text-[rgba(212,175,55,0.7)] mb-2 font-medium">
            Tax-Free Legacy to Your Heirs
          </p>
          <div className="w-16 h-[2px] bg-gold mx-auto mb-6" />
          <p className="text-5xl font-mono font-semibold text-gold mb-1">{toUSD(strategyDB)}</p>
          <p className="text-lg font-display text-foreground mb-4">
            income-tax-free · paid to your beneficiaries over 5 years
          </p>
          <div className="bg-[rgba(0,0,0,0.2)] rounded-lg py-3 px-6 inline-block">
            <p className="text-sm text-text-dim">
              vs. doing nothing:{" "}
              <span className="text-red">{toUSD(baselineLegacy)}</span> to heirs after taxes &amp; forced RMDs
            </p>
          </div>
          {winning && additionalLegacy > 0 && (
            <p className="text-base text-green mt-4 font-medium">
              +{toUSD(additionalLegacy)} more to your heirs by converting to a Roth and skipping RMDs
            </p>
          )}
          <p className="text-sm text-text-dim mt-4">
            No income taken · No RMDs · Held tax-free through age {finalAge}
          </p>
        </div>

        {/* Convert vs. do-nothing — total net legacy */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-bg-card border border-gold-border rounded-[14px] p-7">
            <p className="text-xs uppercase tracking-[1.5px] text-text-muted font-medium mb-2">
              Convert to Roth · hold for legacy
            </p>
            <p className="text-3xl font-mono font-semibold text-green mb-1">{toUSD(strategyLegacy)}</p>
            <p className="text-sm text-text-dim">Total to heirs, income-tax-free</p>
          </div>
          <div className="bg-bg-card border border-border-default rounded-[14px] p-7">
            <p className="text-xs uppercase tracking-[1.5px] text-text-muted font-medium mb-2">
              Do nothing · keep it traditional
            </p>
            <p className="text-3xl font-mono font-semibold text-text-dim mb-1">{toUSD(baselineLegacy)}</p>
            <p className="text-sm text-text-dim">Total to heirs, after heir taxes &amp; forced RMDs</p>
          </div>
        </div>

        {/* What converting avoids */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <MetricCard
            label="Forced Distributions Avoided"
            value={toUSD(lifetimeRMD)}
            sub="RMDs the IRS would drain from a traditional account — you take none in a Roth"
            tone="green"
          />
          <MetricCard
            label="RMD Taxes Avoided"
            value={toUSD(lifetimeRMDTax + heirTaxAvoided)}
            sub={`${toUSD(lifetimeRMDTax)} in lifetime RMD tax + ${toUSD(heirTaxAvoided)} of heir tax on the death benefit`}
            tone="green"
          />
          <MetricCard
            label="One-Time Conversion Cost"
            value={toUSD(conversionTax)}
            sub="Tax to convert the annuity to a Roth — paid once, then never taxed again"
            tone="red"
          />
        </div>

        {/* Year-by-year playbook */}
        <div className="bg-bg-card border border-border-default rounded-[14px] overflow-hidden">
          <div className="flex justify-between items-center px-6 py-5 border-b border-border-default">
            <p className="text-xs uppercase tracking-[1.5px] text-text-muted font-medium">Year-by-Year Projection</p>
            <div className="flex bg-bg-input rounded-lg p-1">
              {(["strategy", "baseline"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setTableView(v)}
                  className={cn(
                    "px-4 py-1.5 text-sm rounded-md transition-colors capitalize",
                    tableView === v ? "bg-gold text-primary-foreground font-medium" : "text-text-muted hover:text-foreground"
                  )}
                >
                  {v === "strategy" ? "Roth (Legacy)" : "Do Nothing"}
                </button>
              ))}
            </div>
          </div>
          <div className="px-6 py-5">
            <YearByYearTable
              years={tableView === "strategy" ? projection.blueprint_years : projection.baseline_years}
              scenario={tableView === "strategy" ? "formula" : "baseline"}
              productType="gi"
              nonSsiIncome={client.non_ssi_income}
              clientId={client.id}
              filingStatus={client.filing_status}
              widowAnalysis={client.widow_analysis}
              widowDeathAge={client.widow_death_age}
            />
          </div>
        </div>

        {/* Product details */}
        <div>
          <button
            onClick={() => setProductDetailsOpen(!productDetailsOpen)}
            className="w-full flex justify-between items-center py-4 text-left"
          >
            <p className="text-xs uppercase tracking-[1.5px] text-text-muted font-medium">Product Details</p>
            {productDetailsOpen ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
          </button>
          {productDetailsOpen && (
            <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
              <div className="grid grid-cols-2 gap-x-12 gap-y-3">
                <DetailRow label="Carrier" value={client.carrier_name} />
                <DetailRow label="Product" value={client.product_name} />
                <DetailRow label="Premium Bonus" value={`${client.bonus_percent ?? 0}% (applied to Benefit Base)`} />
                <DetailRow label="Roll-Up Rate" value={projection.gi_roll_up_description || "N/A"} />
                <DetailRow label="Death Benefit" value="Benefit Base, paid to heirs over 5 years" />
                <DetailRow label="Heir Tax Rate (do-nothing)" value={`${Math.round(heirRate * 100)}%`} />
                <DetailRow label="Surrender Period" value={`${client.surrender_years} years`} />
              </div>
            </div>
          )}
        </div>

        <WidowSection client={client} />

        <p className="text-sm text-text-dim italic text-center max-w-[800px] mx-auto py-6">
          For educational purposes only. The death benefit is the benefit base paid to beneficiaries over at least five
          years (it is not a lump-sum cash value); availability and amounts vary by state. Confirm with the carrier
          illustration and a tax professional before acting.
        </p>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "green" | "red" | "gold" }) {
  const color = tone === "green" ? "text-green" : tone === "red" ? "text-red" : "text-gold";
  return (
    <div className="bg-bg-card border border-border-default rounded-[14px] p-7">
      <p className="text-xs uppercase tracking-[1.5px] text-text-muted font-medium mb-2">{label}</p>
      <p className={cn("text-2xl font-mono font-medium mb-2", color)}>{value}</p>
      <p className="text-sm text-text-dim leading-relaxed">{sub}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-sm text-foreground font-medium text-right">{value || "—"}</span>
    </div>
  );
}
