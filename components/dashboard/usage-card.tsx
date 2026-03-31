"use client";

import { Activity } from "lucide-react";
import type { UsageMetric } from "@/lib/types/dashboard";

interface UsageCardProps {
  usage: {
    scenarios: UsageMetric;
    clients: UsageMetric;
    exports: UsageMetric;
  };
}

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const isUnlimited = limit === null;
  const pct = isUnlimited ? 0 : Math.min((used / limit) * 100, 100);
  const isNearLimit = !isUnlimited && pct >= 80;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-text-dim">{label}</span>
        <span className="font-mono text-foreground/80">
          {used}{isUnlimited ? "" : `/${limit}`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 w-full rounded-full bg-secondary">
          <div
            className={`h-full rounded-full transition-all ${
              isNearLimit ? "bg-[#f59e0b]" : "bg-gold"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function UsageCard({ usage }: UsageCardProps) {
  return (
    <div className="bg-bg-card border border-border-default rounded-[14px] p-[22px_24px] transition-all duration-250 hover:bg-bg-card-hover hover:border-border-hover">
      <div className="w-9 h-9 rounded-[10px] flex items-center justify-center mb-4 bg-accent border border-gold-border">
        <Activity className="w-[18px] h-[18px] text-gold" />
      </div>
      <p className="text-xs font-medium uppercase tracking-[1.5px] text-text-muted mb-3">
        Plan Usage
      </p>
      <div className="space-y-2.5">
        <UsageRow label="Clients" used={usage.clients.used} limit={usage.clients.limit} />
        <UsageRow label="Scenarios" used={usage.scenarios.used} limit={usage.scenarios.limit} />
        <UsageRow label="PDF Exports" used={usage.exports.used} limit={usage.exports.limit} />
      </div>
    </div>
  );
}
