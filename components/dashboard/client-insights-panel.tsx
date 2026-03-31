"use client";

import { formatWholeDollars } from "@/lib/calculations/utils/money";

interface ClientInsightsPanelProps {
  avgClientAge: number;
  avgDeposit: number; // cents
  filingStatusBreakdown: { single: number; mfj: number; mfs: number; hoh: number };
  totalClients: number;
  approachingRMDCount: number;
}

export function ClientInsightsPanel({
  avgClientAge,
  avgDeposit,
  filingStatusBreakdown,
  totalClients,
  approachingRMDCount,
}: ClientInsightsPanelProps) {
  const singlePct = totalClients > 0 ? Math.round((filingStatusBreakdown.single / totalClients) * 100) : 0;
  const mfjPct = totalClients > 0 ? Math.round((filingStatusBreakdown.mfj / totalClients) * 100) : 0;
  const mfsPct = totalClients > 0 ? Math.round((filingStatusBreakdown.mfs / totalClients) * 100) : 0;
  const hohPct = totalClients > 0 ? Math.round((filingStatusBreakdown.hoh / totalClients) * 100) : 0;

  return (
    <div className="bg-bg-card border border-border-default rounded-[14px] p-6 transition-all duration-250 hover:bg-bg-card-hover hover:border-border-hover">
      <h3 className="text-xs font-medium uppercase tracking-[1.5px] text-text-muted mb-6">
        Client Insights
      </h3>

      <div className="space-y-[18px]">
        {/* Average Client Age */}
        <div>
          <p className="text-sm text-text-dim mb-1">Average Client Age</p>
          <p className="text-[20px] font-mono text-foreground/80">{avgClientAge} years old</p>
        </div>

        {/* Average Initial Deposit */}
        <div>
          <p className="text-sm text-text-dim mb-1">Average Initial Deposit</p>
          <p className="text-[20px] font-mono text-foreground/80">{formatWholeDollars(avgDeposit)}</p>
        </div>

        {/* Filing Status Breakdown */}
        <div>
          <p className="text-sm text-text-dim mb-3">Filing Status Breakdown</p>
          <div className="space-y-2">
            {singlePct > 0 && (
              <StatusBar label="Single" percent={singlePct} />
            )}
            {mfjPct > 0 && (
              <StatusBar label="MFJ" percent={mfjPct} />
            )}
            {mfsPct > 0 && (
              <StatusBar label="MFS" percent={mfsPct} />
            )}
            {hohPct > 0 && (
              <StatusBar label="HOH" percent={hohPct} />
            )}
            {totalClients === 0 && (
              <p className="text-sm text-text-dim">No data</p>
            )}
          </div>
        </div>

        {/* Approaching RMD */}
        <div>
          <p className="text-sm text-text-dim mb-1">Approaching RMD Age (75)</p>
          <p className="text-[20px] font-mono text-gold">
            {approachingRMDCount}{" "}
            <span className="text-sm font-sans font-normal text-text-dim">
              clients within 3 years
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusBar({ label, percent }: { label: string; percent: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-text-muted">{label}</span>
        <span className="font-mono text-foreground">{percent}%</span>
      </div>
      <div className="w-full h-1.5 bg-bg-input rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-gold to-[rgba(212,175,55,0.7)] transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
