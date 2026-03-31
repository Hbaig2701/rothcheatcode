"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { Client } from "@/lib/types/client";
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

interface ClientCardProps {
  client: Client;
  delta?: number; // Percent change from baseline
  onDelete?: (id: string) => void;
}

// Helper to format filing status for display
const formatFilingStatus = (status: string): string => {
  const map: Record<string, string> = {
    single: "Single",
    married_filing_jointly: "MFJ",
    married_filing_separately: "MFS",
    head_of_household: "HOH",
  };
  return map[status] || status;
};

// Format currency in compact form
const formatCompactCurrency = (cents: number): string => {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1_000_000) {
    return `$${(dollars / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(dollars) >= 1_000) {
    return `$${Math.round(dollars / 1_000)}K`;
  }
  return `$${Math.round(dollars).toLocaleString()}`;
};

// Format date for display
const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

function DeltaBadge({ value }: { value: number }) {
  const isPositive = value >= 0;
  return (
    <span
      className={`inline-block px-3 py-1 rounded-[20px] text-sm font-mono font-medium ${
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

// Simple sparkline SVG
function Sparkline({ delta }: { delta: number }) {
  // Generate a simple sparkline based on the delta
  const baseline = "M 0 28 Q 100 27 200 25 Q 250 24 300 22";
  const endY = Math.max(5, Math.min(28, 28 - delta * 0.6));
  const strategy = `M 0 28 Q 75 25 150 ${20 - delta * 0.2} Q 225 ${12 - delta * 0.15} 300 ${endY}`;

  return (
    <svg width="100%" height="32" viewBox="0 0 300 32" className="opacity-60">
      <path
        d={baseline}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
        strokeDasharray="4 3"
      />
      <path
        d={strategy}
        fill="none"
        stroke="#d4af37"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function ClientCard({ client, delta = 0, onDelete }: ClientCardProps) {
  const router = useRouter();

  return (
    <div
      onClick={() => router.push(`/clients/${client.id}`)}
      className="block group bg-bg-card border border-border-default rounded-[16px] p-7 transition-all duration-250 hover:bg-bg-card-hover hover:border-border-hover cursor-pointer"
    >
      {/* Header: Name + Badge */}
      <div className="flex justify-between items-start mb-[18px]">
        <div>
          <h3 className="text-lg font-medium text-foreground mb-1">{client.name}</h3>
          <p className="text-sm text-text-dim">
            {formatFilingStatus(client.filing_status)} · Age {client.age} · {client.state}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onDelete && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
              <AlertDialog>
                <AlertDialogTrigger render={
                  <button 
                    onClick={(e) => e.stopPropagation()} 
                    className="p-1.5 text-text-muted hover:text-red hover:bg-red/10 rounded-md transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                } />
                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure you want to delete them?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete {client.name}&apos;s profile and remove their data from our servers.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red hover:bg-red/90 text-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(client.id);
                      }}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
          <DeltaBadge value={delta} />
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex gap-8 mb-3">
        <div>
          <p className="text-xs uppercase tracking-[1px] text-text-muted mb-1">Balance</p>
          <p className="text-base font-mono text-foreground/80">
            {formatCompactCurrency(client.qualified_account_value)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[1px] text-text-muted mb-1">Product</p>
          <p className="text-base font-mono text-foreground/80 truncate max-w-[140px]">
            {client.carrier_name}
          </p>
        </div>
      </div>

      {/* Sparkline */}
      <Sparkline delta={delta} />

      {/* Footer */}
      <p className="text-sm text-text-muted mt-2">
        Created {formatDate(client.created_at)}
      </p>
    </div>
  );
}
