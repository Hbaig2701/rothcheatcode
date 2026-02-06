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
    <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-6 transition-all duration-250 hover:bg-[rgba(255,255,255,0.045)] hover:border-[rgba(212,175,55,0.3)]">
      <h3 className="text-[11px] font-medium uppercase tracking-[1.5px] text-[rgba(255,255,255,0.25)] mb-6">
        Client Insights
      </h3>

      <div className="space-y-[18px]">
        {/* Average Client Age */}
        <div>
          <p className="text-xs text-[rgba(255,255,255,0.25)] mb-1">Average Client Age</p>
          <p className="text-[18px] font-mono text-[rgba(255,255,255,0.5)]">{avgClientAge} years old</p>
        </div>

        {/* Average Initial Deposit */}
        <div>
          <p className="text-xs text-[rgba(255,255,255,0.25)] mb-1">Average Initial Deposit</p>
          <p className="text-[18px] font-mono text-[rgba(255,255,255,0.5)]">{formatWholeDollars(avgDeposit)}</p>
        </div>

        {/* Filing Status Breakdown */}
        <div>
          <p className="text-xs text-[rgba(255,255,255,0.25)] mb-3">Filing Status Breakdown</p>
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
              <p className="text-xs text-[rgba(255,255,255,0.15)]">No data</p>
            )}
          </div>
        </div>

        {/* Approaching RMD */}
        <div>
          <p className="text-xs text-[rgba(255,255,255,0.25)] mb-1">Approaching RMD Age (75)</p>
          <p className="text-[18px] font-mono text-gold">
            {approachingRMDCount}{" "}
            <span className="text-sm font-sans font-normal text-[rgba(255,255,255,0.25)]">
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
        <span className="text-[rgba(255,255,255,0.5)]">{label}</span>
        <span className="font-mono text-white">{percent}%</span>
      </div>
      <div className="w-full h-1.5 bg-[rgba(255,255,255,0.04)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-gold to-[rgba(212,175,55,0.7)] transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
