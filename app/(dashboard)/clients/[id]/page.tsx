"use client";

import { use, useMemo } from "react";
import { useClient } from "@/lib/queries/clients";
import { useProjection } from "@/lib/queries/projections";
import { Button } from "@/components/ui/button";
import { Loader2, Pencil, ArrowLeft, BarChart3 } from "lucide-react";
import { isGuaranteedIncomeProduct, type FormulaType } from "@/lib/config/products";
import type { YearlyResult } from "@/lib/calculations";

interface ClientDetailPageProps {
  params: Promise<{ id: string }>;
}

// Helper to format filing status for display
const formatFilingStatus = (status: string): string => {
  const map: Record<string, string> = {
    single: "Single",
    married_filing_jointly: "Married Filing Jointly",
    married_filing_separately: "Married Filing Separately",
    head_of_household: "Head of Household",
  };
  return map[status] || status;
};

// Helper to format date for display
const formatDate = (dateString: string | null): string => {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

// Format currency
const formatCurrency = (cents: number): string => {
  return `$${(cents / 100).toLocaleString()}`;
};

function DeltaBadge({ value, size = "md" }: { value: number; size?: "md" | "lg" }) {
  const isPositive = value >= 0;
  const sizeStyles = size === "lg"
    ? "px-[18px] py-2 text-[18px]"
    : "px-3 py-1 text-[13px]";
  return (
    <span
      className={`inline-block rounded-[20px] font-mono font-medium ${sizeStyles} ${
        isPositive
          ? "bg-[rgba(74,222,128,0.08)] text-[#4ade80]"
          : "bg-[rgba(248,113,113,0.08)] text-[#f87171]"
      }`}
    >
      {isPositive ? "+" : ""}
      {value}%
    </span>
  );
}

export default function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { id } = use(params);
  const { data: client, isLoading: clientLoading, isError, error } = useClient(id);
  const { data: projectionResponse, isLoading: projectionLoading } = useProjection(id);

  // Calculate percentage improvement from projection
  const delta = useMemo(() => {
    if (!projectionResponse?.projection || !client) return 0;

    const { projection } = projectionResponse;
    const isGI = client.blueprint_type
      ? isGuaranteedIncomeProduct(client.blueprint_type as FormulaType)
      : false;

    // For GI products, use the pre-calculated percent improvement
    if (isGI) {
      return Math.round(projection.gi_percent_improvement ?? 0);
    }

    // For Growth products, calculate the traditional way
    const sum = (years: YearlyResult[], key: keyof YearlyResult) =>
      years.reduce((acc, curr) => acc + (Number(curr[key]) || 0), 0);

    const heirTaxRate = 0.40;
    const totalRMDs = sum(projection.baseline_years, 'rmdAmount');
    const totalBaselineTaxes = sum(projection.baseline_years, 'federalTax') + sum(projection.baseline_years, 'stateTax');
    const totalBaselineIRMAA = sum(projection.baseline_years, 'irmaaSurcharge');
    const afterTaxDistributions = totalRMDs - totalBaselineTaxes;
    const netBaselineLegacy = projection.baseline_final_net_worth * (1 - heirTaxRate);
    const baseLifetime = netBaselineLegacy + afterTaxDistributions - totalBaselineIRMAA;

    const totalTaxes = sum(projection.blueprint_years, 'federalTax') + sum(projection.blueprint_years, 'stateTax');
    const totalIRMAA = sum(projection.blueprint_years, 'irmaaSurcharge');
    const netLegacy = Math.round(projection.blueprint_final_traditional * (1 - heirTaxRate)) + projection.blueprint_final_roth;
    const blueLifetime = netLegacy - totalTaxes - totalIRMAA;

    const diff = blueLifetime - baseLifetime;
    const pct = baseLifetime !== 0 ? (diff / Math.abs(baseLifetime)) * 100 : 0;
    return Math.round(pct);
  }, [projectionResponse, client]);

  const isLoading = clientLoading || projectionLoading;

  if (isLoading) {
    return (
      <div className="p-9">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-[rgba(255,255,255,0.25)]" />
        </div>
      </div>
    );
  }

  if (isError || !client) {
    return (
      <div className="p-9">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <h2 className="text-lg font-semibold text-[#f87171] mb-2">
            Failed to load client
          </h2>
          <p className="text-[rgba(255,255,255,0.5)] mb-4">
            {error?.message || "Client not found"}
          </p>
          <Button variant="outline" render={<a href="/clients" />}>
            Back to clients
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-9">
      {/* Header */}
      <div className="flex items-center gap-4 mb-9">
        <a
          href="/clients"
          className="flex items-center justify-center w-10 h-10 rounded-lg border border-[rgba(255,255,255,0.07)] text-[rgba(255,255,255,0.5)] hover:bg-[rgba(255,255,255,0.04)] hover:border-[rgba(212,175,55,0.3)] transition-all"
        >
          <ArrowLeft className="h-4 w-4" />
        </a>
        <div className="flex-1">
          <h1 className="font-display text-[28px] font-normal text-white">{client.name}</h1>
          <p className="text-[13px] text-[rgba(255,255,255,0.25)] mt-1">
            Client since {formatDate(client.created_at)}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/clients/${client.id}/edit`}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[rgba(255,255,255,0.5)] bg-transparent border border-[rgba(255,255,255,0.07)] rounded-[10px] hover:bg-[rgba(255,255,255,0.04)] hover:border-[rgba(212,175,55,0.3)] transition-all"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </a>
          <a
            href={`/clients/${client.id}/results`}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[#0c0c0c] bg-gold rounded-[10px] hover:bg-[rgba(212,175,55,0.9)] transition-colors"
          >
            View Results
            <BarChart3 className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* Basic Information */}
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[16px] p-7">
          <h2 className="text-[15px] font-medium text-white mb-6">Basic Information</h2>
          <div className="space-y-0">
            {[
              { label: "Age", value: `${client.age} years old` },
              ...(client.spouse_name
                ? [{ label: "Spouse", value: `${client.spouse_name}, age ${client.spouse_age}` }]
                : []),
              { label: "State", value: client.state },
              { label: "Filing Status", value: formatFilingStatus(client.filing_status) },
              { label: "Qualified Balance", value: formatCurrency(client.qualified_account_value) },
            ].map((item) => (
              <div
                key={item.label}
                className="flex justify-between py-2.5 border-b border-[rgba(255,255,255,0.07)] last:border-b-0"
              >
                <span className="text-[13px] text-[rgba(255,255,255,0.25)]">{item.label}</span>
                <span className="text-[13px] font-mono text-[rgba(255,255,255,0.5)]">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Roth Conversion Scenarios */}
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[16px] p-7">
          <h2 className="text-[15px] font-medium text-white mb-3">Roth Conversion Scenarios</h2>
          <p className="text-[13px] text-[rgba(255,255,255,0.25)] mb-7">
            Compare strategies and find the optimal approach for this client.
          </p>

          {/* Scenario Card */}
          <a
            href={`/clients/${client.id}/results`}
            className="block bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.2)] rounded-[12px] p-5 mb-4 hover:bg-[rgba(212,175,55,0.12)] transition-colors cursor-pointer"
          >
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[14px] font-medium text-white mb-1">
                  {client.product_name} · {client.carrier_name}
                </p>
                <p className="text-xs text-[rgba(255,255,255,0.25)]">
                  Optimized conversion · Max {client.max_tax_rate}% bracket
                </p>
              </div>
              <DeltaBadge value={delta} size="lg" />
            </div>
          </a>

          <button className="w-full py-2.5 px-4 text-sm font-medium text-[rgba(255,255,255,0.5)] bg-transparent border border-[rgba(255,255,255,0.07)] rounded-[10px] hover:bg-[rgba(255,255,255,0.04)] hover:border-[rgba(212,175,55,0.3)] transition-all">
            + New Scenario
          </button>
        </div>
      </div>
    </div>
  );
}
