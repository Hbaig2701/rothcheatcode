"use client";

import { use, useMemo } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClient, useClientScenarios, useDuplicateClient, useUpdateClient, useDeleteClient, clientKeys } from "@/lib/queries/clients";
import { useQueryClient } from "@tanstack/react-query";
import { useProjection } from "@/lib/queries/projections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Pencil, ArrowLeft, Plus, Check, X, Copy, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
    : "px-3 py-1 text-[14px]";
  return (
    <span
      className={`inline-block rounded-[20px] font-mono font-medium ${sizeStyles} ${
        isPositive
          ? "bg-green-bg text-green"
          : "bg-red-bg text-red"
      }`}
    >
      {isPositive ? "+" : ""}
      {value}%
    </span>
  );
}

export default function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { data: client, isLoading: clientLoading, isError, error } = useClient(id);
  const { data: scenarios, isLoading: scenariosLoading } = useClientScenarios(id);
  const duplicateScenario = useDuplicateClient();
  const updateClient = useUpdateClient();
  const { data: projectionResponse, isLoading: projectionLoading } = useProjection(id);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const deleteClient = useDeleteClient();
  const queryClient = useQueryClient();

  const [actionType, setActionType] = useState<"duplicate" | "delete" | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);

  const handleCloseDialog = () => {
    setActionType(null);
    setSelectedScenarioId(null);
  };

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

    // For Growth products, use same logic as results/page.tsx
    const heirTaxRate = (client.heir_tax_rate ?? 40) / 100;
    const rmdTreatment = client.rmd_treatment ?? 'reinvested';

    // Baseline: heir tax only on traditional portion
    const baseHeirTax = Math.round(projection.baseline_final_traditional * heirTaxRate);
    const baseNetLegacy = projection.baseline_final_net_worth - baseHeirTax;
    const lastBaselineYear = projection.baseline_years[projection.baseline_years.length - 1];
    const baseCumulativeDistributions = lastBaselineYear?.cumulativeDistributions ?? 0;
    const baseLifetime = rmdTreatment === 'spent'
      ? baseNetLegacy + baseCumulativeDistributions
      : baseNetLegacy;

    // Strategy
    const blueHeirTax = Math.round(projection.blueprint_final_traditional * heirTaxRate);
    const blueLifetime = projection.blueprint_final_net_worth - blueHeirTax;

    const diff = blueLifetime - baseLifetime;
    const pct = baseLifetime !== 0 ? diff / Math.abs(baseLifetime) : 0;
    return Math.round(pct * 100);
  }, [projectionResponse, client]);

  const isLoading = clientLoading || projectionLoading || scenariosLoading;

  if (isLoading) {
    return (
      <div className="p-9">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-text-dim" />
        </div>
      </div>
    );
  }

  if (isError || !client) {
    return (
      <div className="p-9">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <h2 className="text-lg font-semibold text-red mb-2">
            Failed to load client
          </h2>
          <p className="text-text-muted mb-4">
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
          className="flex items-center justify-center w-10 h-10 rounded-lg border border-border-default text-text-muted hover:bg-secondary hover:border-border-hover transition-all"
        >
          <ArrowLeft className="h-4 w-4" />
        </a>
        <div className="flex-1">
          <h1 className="font-display text-[28px] font-normal text-foreground">{client.name}</h1>
          <p className="text-sm text-text-dim mt-1">
            Client since {formatDate(client.created_at)}
          </p>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* Basic Information */}
        <div className="bg-bg-card border border-border-default rounded-[16px] p-7">
          <h2 className="text-base font-medium text-foreground mb-6">Basic Information</h2>
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
                className="flex justify-between py-2.5 border-b border-border-default last:border-b-0"
              >
                <span className="text-sm text-text-dim">{item.label}</span>
                <span className="text-sm font-mono text-foreground/80">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Roth Conversion Scenarios */}
        <div className="bg-bg-card border border-border-default rounded-[16px] p-7">
          <h2 className="text-base font-medium text-foreground mb-3">Roth Conversion Scenarios</h2>
          <p className="text-sm text-text-dim mb-7">
            Compare strategies and find the optimal approach for this client.
          </p>

          {/* Scenario Cards */}
          {scenarios?.map((scenario) => {
            // Use API returned delta or fallback to currently viewed client delta if they are the exact same ID
            const scenarioDelta = scenario.id === client.id ? delta : ((scenario as any).delta ?? 0);
            
            const isEditing = editingId === scenario.id;
            const displayName = scenario.scenario_name || scenario.product_name;

            const CardWrapper = isEditing ? "div" : "a";
            const wrapperProps = isEditing ? {} : { href: `/clients/${scenario.id}/results` };

            return (
              <CardWrapper
                key={scenario.id}
                {...wrapperProps}
                className={`group block bg-accent border rounded-[12px] p-5 mb-4 transition-colors relative ${
                  scenario.id === client.id ? 'border-gold-border' : 'border-border-default hover:bg-[rgba(212,175,55,0.12)]'
                }`}
              >
                <div className="flex justify-between items-center relative z-10">
                  <div className="flex-1 mr-4">
                    {/* Title / Edit Area */}
                    <div className="flex items-center gap-2 mb-1 min-h-[28px]">
                      {isEditing ? (
                        <div className="flex items-center gap-1 w-full max-w-[300px]">
                          <Input 
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                updateClient.mutate({ id: scenario.id, data: { scenario_name: editName }});
                                setEditingId(null);
                              } else if (e.key === 'Escape') setEditingId(null);
                            }}
                            autoFocus
                            className="h-7 text-[14px] font-medium px-2 py-0 bg-background flex-1 focus-visible:ring-1"
                          />
                          <button 
                            onClick={() => {
                              updateClient.mutate({ id: scenario.id, data: { scenario_name: editName }});
                              setEditingId(null);
                            }}
                            className="p-1 rounded bg-gold text-primary-foreground hover:bg-[rgba(212,175,55,0.9)] transition-colors"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button 
                            onClick={() => setEditingId(null)} 
                            className="p-1 text-text-dim hover:text-text-muted transition-colors rounded hover:bg-secondary"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 w-full">
                          <p className="text-[14px] font-medium text-foreground">
                            {displayName}
                          </p>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setEditName(displayName);
                              setEditingId(scenario.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-text-dim hover:text-gold rounded hover:bg-[rgba(212,175,55,0.1)]"
                            aria-label="Rename scenario"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedScenarioId(scenario.id);
                              setActionType("duplicate");
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-text-dim hover:text-gold rounded hover:bg-[rgba(212,175,55,0.1)] pointer-events-auto"
                            aria-label="Duplicate scenario"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>

                          {/* Allow delete on every row. If the user deletes the
                              scenario whose ID matches the URL (i.e. the one
                              loading this page), the delete handler redirects
                              to a remaining scenario or back to the clients list. */}
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedScenarioId(scenario.id);
                              setActionType("delete");
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-text-dim hover:text-red rounded hover:bg-red-bg pointer-events-auto"
                            aria-label="Delete scenario"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <p className="text-sm text-text-dim">
                      {isEditing ? (
                        `${scenario.product_name} · ${scenario.carrier_name}`
                      ) : (
                        scenario.scenario_name ? (
                          `${scenario.product_name} · ${scenario.carrier_name}`
                        ) : (
                          `Optimized conversion · Max ${scenario.max_tax_rate}% bracket`
                        )
                      )}
                    </p>
                  </div>
                  <DeltaBadge value={scenarioDelta} size="lg" />
                </div>
              </CardWrapper>
            );
          })}

          <button 
            onClick={() => duplicateScenario.mutate(client.id, { onSuccess: (data) => router.push(`/clients/${data.id}/edit`) })}
            disabled={duplicateScenario.isPending}
            className="w-full h-[42px] flex items-center justify-center gap-2 px-4 text-sm font-medium text-text-muted bg-transparent border border-border-default rounded-[10px] hover:bg-secondary hover:border-border-hover transition-all disabled:opacity-50"
          >
            {duplicateScenario.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                New Scenario
              </>
            )}
          </button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={actionType !== null} onOpenChange={(open) => !open && handleCloseDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === "duplicate" ? "Duplicate Scenario" : "Delete Scenario"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === "duplicate"
                ? "Are you sure you want to duplicate this scenario? This will create a carbon copy that you can edit."
                : "Are you sure you want to delete this scenario? This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={actionType === "delete" ? "bg-red text-white hover:bg-red/90" : "bg-gold text-white hover:bg-gold/90"}
              onClick={(e) => {
                e.preventDefault();
                if (actionType === "duplicate" && selectedScenarioId) {
                  duplicateScenario.mutate(selectedScenarioId, {
                    onSuccess: () => {
                      queryClient.invalidateQueries({ queryKey: clientKeys.scenarios(client.id) });
                    }
                  });
                } else if (actionType === "delete" && selectedScenarioId) {
                  // Remember the deleted ID and the remaining scenarios BEFORE
                  // the cache is invalidated, so we can decide where to redirect.
                  const deletedId = selectedScenarioId;
                  const wasViewingDeleted = deletedId === client.id;
                  const remaining = (scenarios ?? []).filter((s) => s.id !== deletedId);

                  deleteClient.mutate(deletedId, {
                    onSuccess: () => {
                      queryClient.invalidateQueries({ queryKey: clientKeys.scenarios(client.id) });
                      // If the user deleted the scenario currently loaded by the
                      // URL, redirect to a remaining scenario, or back to the
                      // clients list if there are none left.
                      if (wasViewingDeleted) {
                        if (remaining.length > 0) {
                          router.replace(`/clients/${remaining[0].id}`);
                        } else {
                          router.replace("/clients");
                        }
                      }
                    },
                  });
                }
                handleCloseDialog();
              }}
            >
              {deleteClient.isPending || duplicateScenario.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Confirm"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
