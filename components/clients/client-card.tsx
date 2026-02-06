"use client";

import Link from "next/link";
import type { Client } from "@/lib/types/client";

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
      className={`inline-block px-3 py-1 rounded-[20px] text-[13px] font-mono font-medium ${
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

export function ClientCard({ client, delta = 0 }: ClientCardProps) {
  return (
    <Link
      href={`/clients/${client.id}`}
      className="block bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[16px] p-7 transition-all duration-250 hover:bg-[rgba(255,255,255,0.045)] hover:border-[rgba(212,175,55,0.3)] cursor-pointer"
    >
      {/* Header: Name + Badge */}
      <div className="flex justify-between items-start mb-[18px]">
        <div>
          <h3 className="text-[17px] font-medium text-white mb-1">{client.name}</h3>
          <p className="text-xs text-[rgba(255,255,255,0.25)]">
            {formatFilingStatus(client.filing_status)} · Age {client.age} · {client.state}
          </p>
        </div>
        <DeltaBadge value={delta} />
      </div>

      {/* Stats Row */}
      <div className="flex gap-8 mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-[1px] text-[rgba(255,255,255,0.15)] mb-1">Balance</p>
          <p className="text-[15px] font-mono text-[rgba(255,255,255,0.5)]">
            {formatCompactCurrency(client.qualified_account_value)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[1px] text-[rgba(255,255,255,0.15)] mb-1">Product</p>
          <p className="text-[15px] font-mono text-[rgba(255,255,255,0.5)] truncate max-w-[120px]">
            {client.carrier_name}
          </p>
        </div>
      </div>

      {/* Sparkline */}
      <Sparkline delta={delta} />

      {/* Footer */}
      <p className="text-[11px] text-[rgba(255,255,255,0.15)] mt-2">
        Created {formatDate(client.created_at)}
      </p>
    </Link>
  );
}
