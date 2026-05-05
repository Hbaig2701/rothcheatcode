"use client";

import { useRouter } from "next/navigation";
import { Trash2, Layers } from "lucide-react";
import type { Client } from "@/lib/types/client";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Compact tabular view of the clients list. Shows the same set advisors get
 * in the grid view (one row per client, scenarios collapsed under their
 * primary record) but with the columns advisors asked for: name, age,
 * filing status, qualified balance, scenario count, delta, and created date.
 */

interface ClientRow extends Client {
  delta?: number | null;
  scenario_count?: number;
}

interface ClientsListViewProps {
  clients: ClientRow[];
  onDelete?: (id: string) => void;
}

const formatFilingStatus = (status: string): string => {
  const map: Record<string, string> = {
    single: "Single",
    married_filing_jointly: "MFJ",
    married_filing_separately: "MFS",
    head_of_household: "HoH",
  };
  return map[status] || status;
};

const formatCompactCurrency = (cents: number): string => {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (Math.abs(dollars) >= 1_000) return `$${Math.round(dollars / 1_000)}K`;
  return `$${Math.round(dollars).toLocaleString()}`;
};

const formatDate = (dateString: string): string =>
  new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

function DeltaPill({ value }: { value: number | null | undefined }) {
  if (value == null) {
    return <span className="text-text-dim text-sm">—</span>;
  }
  const isPositive = value >= 0;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-semibold ${
        isPositive ? "bg-green-bg text-green" : "bg-red-bg text-red"
      }`}
    >
      {isPositive ? "+" : ""}
      {value}%
    </span>
  );
}

export function ClientsListView({ clients, onDelete }: ClientsListViewProps) {
  const router = useRouter();

  if (clients.length === 0) return null;

  return (
    <div className="rounded-[14px] border border-border-default bg-bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/30 border-b border-border-default">
            <tr className="text-left">
              <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">Name</th>
              <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">Profile</th>
              <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">Balance</th>
              <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">Product</th>
              <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">Scenarios</th>
              <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">Δ vs Baseline</th>
              <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">Created</th>
              <th className="px-5 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr
                key={client.id}
                onClick={() => router.push(`/clients/${client.id}`)}
                className="group border-b border-border-default last:border-0 cursor-pointer hover:bg-bg-card-hover transition-colors"
              >
                <td className="px-5 py-3.5">
                  <div className="font-medium text-foreground">{client.name}</div>
                  {client.scenario_name && (
                    <div className="text-xs text-text-dim mt-0.5">{client.scenario_name}</div>
                  )}
                </td>
                <td className="px-5 py-3.5 text-text-muted whitespace-nowrap">
                  {formatFilingStatus(client.filing_status)} · Age {client.age}
                  {client.state ? ` · ${client.state}` : ""}
                </td>
                <td className="px-5 py-3.5 font-mono text-foreground/90 whitespace-nowrap">
                  {formatCompactCurrency(client.qualified_account_value)}
                </td>
                <td className="px-5 py-3.5 text-text-muted">
                  <div className="truncate max-w-[180px]">{client.product_name}</div>
                  {client.carrier_name && (
                    <div className="text-xs text-text-dim truncate max-w-[180px]">{client.carrier_name}</div>
                  )}
                </td>
                <td className="px-5 py-3.5 text-text-muted whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 opacity-70" />
                    {client.scenario_count ?? 1}
                  </span>
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <DeltaPill value={client.delta} />
                </td>
                <td className="px-5 py-3.5 text-text-muted whitespace-nowrap">
                  {formatDate(client.created_at)}
                </td>
                <td className="px-5 py-3.5 w-12">
                  {onDelete && (
                    <div
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <button
                              onClick={(e) => e.stopPropagation()}
                              className="p-1.5 text-text-muted hover:text-red hover:bg-red/10 rounded-md transition-colors"
                              aria-label={`Delete ${client.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          }
                        />
                        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete {client.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. {client.name}&apos;s profile and all data will be permanently removed.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
                            <AlertDialogPrimitive.Close
                              render={
                                <AlertDialogAction
                                  className="bg-red hover:bg-red/90 text-white"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(client.id);
                                  }}
                                >
                                  Delete
                                </AlertDialogAction>
                              }
                            />
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
